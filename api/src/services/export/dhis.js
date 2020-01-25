const _ = require('lodash');
const moment = require('moment');

const db = require('../../db');
const settings = require('../settings');

/**
 * @param {string} filters.dataSet
 * @param {integer} filters.from
 * @param {string=} filters.orgUnit
 *
 * @param options.humanReadable
 */
module.exports = async (filters, options = {}) => {
  const { dataSet, orgUnit } = filters;
  const { from } = filters.date || {};
  if (!dataSet) {
    throw { code: 422, message: 'filter "dataSet" is required' };
  }

  if (!from) {
    throw { code: 422, message: 'filter "from" is required' };
  }

  const settingsDoc = await settings.get();
  const dataSetConfig = settingsDoc.dhisDataSets &&
    Array.isArray(settingsDoc.dhisDataSets) &&
    settingsDoc.dhisDataSets.find(dhisDataSet => dhisDataSet.guid === dataSet);
  if (!dataSetConfig) {
    throw { code: 422, message: `dataSet "${dataSet}" is not defined` };
  }
  
  const dhisTargetDefinitions = getDhisTargetDefinitions(dataSet, settingsDoc);
  if (dhisTargetDefinitions.length === 0) {
    throw { code: 422, message: `dataSet "${dataSet}" has no dataElements` };
  }
  
  const targetDocsAtInterval = await fetch.targetDocsAtInterval(from);
  const contactsWithOrgUnits = await fetch.contactsWithOrgUnits(orgUnit);
  const targetOwnerIds = _.uniq(targetDocsAtInterval.map(target => target.owner));
  const targetOwners = await fetch.docsWithId(targetOwnerIds);
  const mapContactIdToOrgUnit = mapContactIdToOrgUnits(dataSet, targetOwners, contactsWithOrgUnits);
  const targetDocsInHierarchy = targetDocsAtInterval.filter(target => !orgUnit || mapContactIdToOrgUnit[target.owner]);

  const result = {
    dataSet,
    completeDate: moment().format('YYYY-MM-DD'),
    period: moment(from).format('YYYYMM'),
    dataValues: buildDataValues(dhisTargetDefinitions, targetDocsInHierarchy, mapContactIdToOrgUnit),
  };

  if (options.humanReadable) {
    makeHumanReadable(
      result,
      dataSetConfig,
      Object.values(dhisTargetDefinitions),
      Object.values(contactsWithOrgUnits)
    );
  }

  return result;
};

const fetch = {
  docsWithId: async ids => {
    const fetched = await db.medic.allDocs({ keys: ids, include_docs: true });
    return fetched.rows.map(row => row.doc);
  },

  contactsWithOrgUnits: async orgUnit => {
    const fetched = await db.medic.query('medic-admin/contacts_by_orgunit', { key: orgUnit, include_docs: true });
    return _.uniqBy(fetched.rows.map(row => row.doc), '_id');
  },

  targetDocsAtInterval: async timestamp => {
    const interval = moment(timestamp).format('YYYY-MM');
    const result = await db.medic.allDocs({
      startkey: `target~${interval}~`,
      endkey: `target~${interval}~\ufff0`,
      include_docs: true,
    });

    return result.rows.map(row => row.doc);
  },
};

const getDhisTargetDefinitions = (dataSet, settingsDoc) => {
  const dhisTargets = settingsDoc.tasks &&
    settingsDoc.tasks.targets &&
    settingsDoc.tasks.targets.items &&
    settingsDoc.tasks.targets.items.filter(target =>
      target.dhis &&
      target.dhis.dataElement &&
      (!target.dhis.dataSet || target.dhis.dataSet === dataSet)
    ) || [];

  return dhisTargets;
};

/**
 * @param {string} dataSet The dataset being exported. It acts as a filter for relevant orgUnits
 * @param {Object[]} contacts The set of contact documents relevant to the calculation
 * @returns {Object} The @param contacts _id values mapped to an array of orgUnits above them in the hierarchy
 */
const mapContactIdToOrgUnits = (dataSet, contacts, contactsWithOrgUnits) => {
  const result = {};
  for (const contact of contactsWithOrgUnits) {
    const dhisConfigs = Array.isArray(contact.dhis) ? contact.dhis : [contact.dhis];
    for (const dhisConfig of dhisConfigs) {
      const dataSetMatch = !dhisConfig.dataSet || dhisConfig.dataSet === dataSet;
      if (dhisConfig.orgUnit && dataSetMatch) {
        if (!result[contact._id]) {
          result[contact._id] = [];
        }

        result[contact._id].push(dhisConfig.orgUnit);
      }
    }
  }
  
  for (const contact of contacts) {
    let traverse = contact;
    while (traverse) {
      if (result[traverse._id]) {
        const existing = result[contact._id] || [];
        result[contact._id] = _.uniq([...existing, ...result[traverse._id]]);
      }

      traverse = traverse.parent;
    }
  }

  return result;
};

const buildDataValues = (targetDefinitions, targetDocs, orgUnits) => {
  const mapTargetIdToDhis = ObjectFromEntries(targetDefinitions.map(target => ([target.id, target.dhis])));
  const createEmptyValueSetFor = orgUnit => {
    const result = {};
    for (const target of targetDefinitions) {
      const { dataElement } = target.dhis;
      result[dataElement] = Object.assign(
        {},

        /*
        Copies any attribute defined in dhis config onto the dataValue
        Primary usecase is `categoryOptionCombo` and `attributeOptionCombo` but there are many others
        */
        target.dhis,
        { orgUnit, value: 0 },
      );
      delete result[dataElement].dataSet;
    }
    return result;
  };

  // all results start with 0s
  const dataValueSet = {};
  for (const contactOrgUnits of Object.values(orgUnits)) {
    for (const orgUnit of contactOrgUnits) {
      if (!dataValueSet[orgUnit]) {
        dataValueSet[orgUnit] = createEmptyValueSetFor(orgUnit);
      }
    }
  }

  // add relevant values onto the result
  for (const targetDoc of targetDocs) {
    const unitsOfOwner = orgUnits[targetDoc.owner];
    if (!unitsOfOwner) {
      continue;
    }

    for (const orgUnit of unitsOfOwner) {
      for (const target of targetDoc.targets) {
        const dataElement = mapTargetIdToDhis[target.id] && mapTargetIdToDhis[target.id].dataElement;
        if (dataElement) {
          const dataValueObj = dataValueSet[orgUnit][dataElement];
          if (dataValueObj) {
            dataValueObj.value += target.value.total;
          }
        }
      }
    }
  }

  return _.flatten(Object.values(dataValueSet).map(dataValueGroup => Object.values(dataValueGroup)));
};

const makeHumanReadable = (response, dataSetConfig, dhisTargetDefinitions, contacts) => {
  const { dataValues } = response;
  response.dataSet = dataSetConfig.label;

  const mapOrgUnitsToContact = {};
  for (const contact of contacts) {
    const dhisConfigs = Array.isArray(contact.dhis) ? contact.dhis : [contact.dhis];
    for (const dhisConfig of dhisConfigs) {
      mapOrgUnitsToContact[dhisConfig.orgUnit] = contact;
    }
  }

  const entries = dhisTargetDefinitions.map(target => ([target.dhis.dataElement, target]));
  const mapDataElementToTarget = ObjectFromEntries(entries);

  for (const dataValue of dataValues) {
    dataValue.orgUnit = mapOrgUnitsToContact[dataValue.orgUnit].name;
    dataValue.dataElement = mapDataElementToTarget[dataValue.dataElement].id;
  }
};

// Object.fromEntries requires node 12
const ObjectFromEntries = entries => entries.reduce((agg, [index, val]) => {
  agg[index] = val;
  return agg;
}, {});
