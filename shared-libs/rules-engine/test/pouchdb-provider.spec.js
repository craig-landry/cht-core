const chai = require('chai');
const chaiExclude = require('chai-exclude');
const memdownMedic = require('@medic/memdown');
const sinon = require('sinon');

const { chtDocs } = require('./mocks');
const pouchdbProvider = require('../src/pouchdb-provider');
const { expect } = chai;
chai.use(chaiExclude);

const mockUserDoc = { _id: 'mock_user_id' };
const reportConnectedByPlace = {
  _id: 'reportByPlace',
  type: 'data_record',
  form: 'form',
  place_id: 'patient',
  reported_date: 2000,
};
const headlessReport = {
  _id: 'headlessReport',
  type: 'data_record',
  form: 'form',
  patient_id: 'headless',
  reported_date: 1000,
};
const taskOwnedByChtContact = {
  _id: 'taskOwnedBy',
  type: 'task',
  owner: 'patient',
};
const taskRequestedByChtContact = {
  _id: 'taskReqiestedBy',
  type: 'task',
  requester: 'patient',
};
const headlessTask = {
  _id: 'headlessTask',
  type: 'task',
  requester: 'headless',
  owner: 'headless',
};

const fixtures = [
  chtDocs.contact,

  chtDocs.pregnancyReport,
  headlessReport,
  reportConnectedByPlace,

  taskOwnedByChtContact,
  taskRequestedByChtContact,
  headlessTask,
];

describe('pouchdb provider', () => {
  let db;
  beforeEach(async () => {
    db = await memdownMedic('../..');
    await db.bulkDocs(fixtures);

    sinon.spy(db, 'put');
    sinon.spy(db, 'query');
  });

  describe('allTasks', () => {
    it('for owner', async () => expect(await pouchdbProvider(db).allTasks('owner')).excludingEvery('_rev').to.deep.eq([headlessTask, taskOwnedByChtContact]));
    it('for requester', async () => expect(await pouchdbProvider(db).allTasks('requester')).excludingEvery('_rev').to.deep.eq([headlessTask, taskRequestedByChtContact]));
  });

  it('allTaskData', async () => {
    expect(await pouchdbProvider(db).allTaskData(mockUserDoc)).excludingEvery('_rev').to.deep.eq({
      contactDocs: [chtDocs.contact],
      reportDocs: [headlessReport, reportConnectedByPlace, chtDocs.pregnancyReport],
      taskDocs: [headlessTask, taskRequestedByChtContact], // not owner
      userContactId: mockUserDoc._id,
    });
  });

  describe('contactsBySubjectId', () => {
    it('empty yields empty', async () => expect(await pouchdbProvider(db).contactsBySubjectId([])).to.be.empty);
    it('patient_id yields id', async () => expect(await pouchdbProvider(db).contactsBySubjectId(['patient_id'])).to.deep.eq(['patient']));
    it('uuid yields uuid', async () => expect(await pouchdbProvider(db).contactsBySubjectId(['patient'])).to.deep.eq(['patient']));
    it('uuid and patient_id', async () => expect(await pouchdbProvider(db).contactsBySubjectId(['patient', 'patient_id'])).to.deep.eq(['patient', 'patient'])); // dupes don't matter here
  });

  describe('contactStateStore', () => {
    it('contactStateStore is undefined by default', async () => {
      expect(await pouchdbProvider(db).existingContactStateStore()).to.be.undefined;
    });

    it('fake contactStateStore can be fetched', async () => {
      const expected = { _id: '_local/taskState', details: 'stuff' };
      await db.put(expected);

      const actual = await pouchdbProvider(db).existingContactStateStore();
      expect(actual).excluding('_rev').to.deep.eq(expected);

      await pouchdbProvider(db).stateChangeCallback(actual, { updated: true });
      expect(await pouchdbProvider(db).existingContactStateStore()).excluding('_rev').to.deep.eq({
        _id: '_local/taskState',
        contactStateStore: {
          updated: true,
        },
        details: 'stuff'
      });
    });
  });

  describe('tasksByRelation', () => {
    it('by owner', async () => {
      const actual = await pouchdbProvider(db).tasksByRelation([chtDocs.contact._id, 'abc'], 'owner');
      expect(actual).excluding('_rev').to.deep.eq([taskOwnedByChtContact]);
    });

    it('by requester', async () => {
      const actual = await pouchdbProvider(db).tasksByRelation([chtDocs.contact._id, 'abc'], 'requester');
      expect(actual).excluding('_rev').to.deep.eq([taskRequestedByChtContact]);
    });
  });

  describe('taskDataFor', () => {
    it('no contacts yields empty', async() => expect(await pouchdbProvider(db).taskDataFor([])).to.be.empty);
    it('empty contacts yields empty', async() => expect(await pouchdbProvider(db).taskDataFor([])).to.be.empty);
    it('unrecognized contact id yields empty', async () => {
      expect(await pouchdbProvider(db).taskDataFor(['abc'], mockUserDoc)).to.deep.eq({
        contactDocs: [],
        reportDocs: [],
        taskDocs: [],
        userContactId: 'mock_user_id',
      });
    });
    it('cht contact yields', async() => {
      const actual = await pouchdbProvider(db).taskDataFor([chtDocs.contact._id, 'abc'], mockUserDoc);
      expect(actual).excludingEvery('_rev').to.deep.eq({
        contactDocs: [chtDocs.contact],
        reportDocs: [reportConnectedByPlace, chtDocs.pregnancyReport],
        taskDocs: [taskRequestedByChtContact],
        userContactId: 'mock_user_id',
      });
    });
  });
});