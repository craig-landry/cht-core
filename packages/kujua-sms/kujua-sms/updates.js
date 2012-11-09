/**
 * Update functions to be exported from the design doc.
 */

var _ = require('underscore')._,
    logger = require('kujua-utils').logger,
    jsonforms = require('views/lib/jsonforms'),
    smsparser = require('views/lib/smsparser'),
    validate = require('./validate'),
    utils = require('./utils');


/**
 * @param {String} form - jsonforms key string
 * @param {Object} form_data - parsed form data
 * @returns {String} - Reporting Unit ID value
 * @api private
 */
var getRefID = function(form, form_data) {
    var def = jsonforms[form];

    if (!def || !def.facility_reference)
        return;

    return form_data[def.facility_reference];
};

/**
 * @param {String} phone - phone number of the sending phone (from)
 * @param {Object} doc - sms_message doc created from initial POST
 * @param {Object} form_data - parsed form data
 * @returns {Object} - data record
 * @api private
 */
var getDataRecord = exports.getDataRecord = function(doc, form_data) {
    var form = doc.form,
        def = jsonforms[form];

    var record = {
        _id: req.uuid,
        type: 'data_record',
        from: doc.from,
        form: form,
        related_entities: {clinic: null},
        errors: [],
        responses: [],
        tasks: [],
        reported_date: new Date().getTime(),
        // keep message data part of record
        sms_message: doc
    };

    if (form && !def) {
        utils.addError(record, 'form_not_found_sys');
        utils.addError(record, 'form_not_found');
    }

    // try to parse timestamp from gateway
    var ts = parseSentTimestamp(doc.sent_timestamp);
    if (ts)
        record.reported_date = ts;

    if (def) {
        if (def.facility_reference)
            record.refid = form_data[def.facility_reference];

        for (var k in def.fields) {
            var field = def.fields[k];
            smsparser.merge(form, k.split('.'), record, form_data);
        }
        var errors = validate.validate(def, form_data);
        errors.forEach(function(err) {
            utils.addError(record, err);
        });
    }

    if (form_data && form_data._extra_fields)
        utils.addError(record, 'extra_fields');

    if (!doc.message || !doc.message.trim()) {
        utils.addError(record, 'empty_sys');
        utils.addError(record, 'empty');
    }

    return record;
};

/**
 * @param {String} phone - phone number of the sending phone (from)
 * @param {String} form - jsonforms key string
 * @param {Object} form_data - parsed form data
 * @returns {String} - Path for callback
 * @api private
 */
var getCallbackPath = function(phone, form, form_data, def) {

    def = def ? def : jsonforms[form];

    // if the definition has use_sentinel:true, shortcut
    if (def && def.use_sentinel)
        return '/_db';

    if (!form) {
        // find a match with a facility's phone number
        return '/data_record/add/facility/%2'
                    .replace('%2', encodeURIComponent(phone));
    }

    if (def && def.facility_reference) {
        return '/%1/data_record/add/refid/%2'
                  .replace('%1', encodeURIComponent(form))
                  .replace('%2', encodeURIComponent(
                      getRefID(form, form_data)));
    }

    // find a match with a facility's phone number
    return '/%1/data_record/add/facility/%2'
                .replace('%1', encodeURIComponent(form))
                .replace('%2', encodeURIComponent(phone));
};

/*
 * Try to parse SMSSync gateway sent_timestamp field and use it for
 * reported_date.  Particularly useful when re-importing data from gateway to
 * maintain accurate reported_date field.
 *
 * return unix timestamp string or undefined
 */
var parseSentTimestamp = function(str) {
    if(!str) { return; }
    var match = str.match(/(\d{1,2})-(\d{1,2})-(\d{2})\s(\d{1,2}):(\d{2})(:(\d{2}))?/),
        ret,
        year;
    if (match) {
        ret = new Date();

        year = ret.getFullYear();
        year -= year % 100; // round to nearest 100
        ret.setYear(year + parseInt(match[3], 10)); // works until 2100

        ret.setMonth(parseInt(match[1],10) - 1);
        ret.setDate(parseInt(match[2], 10));
        ret.setHours(parseInt(match[4], 10));
        ret.setMinutes(match[5]);
        ret.setSeconds(match[7] || 0);
        ret.setMilliseconds(0);
        return ret.getTime();
    }
};

/*
 * @param {Object} doc - data_record object as returned from getDataRecord
 * @returns {Object} - smssync gateway response payload json object
 * @api private
 *
 * Form validation errors are included in doc.errors.
 * Always limit outgoing message to 160 chars and only send one message.
 *
 */
var getSMSResponse = function(doc) {

    var locale = doc.sms_message.locale,
        msg = utils.getMessage('sms_received', locale),
        def = doc.form && jsonforms[doc.form],
        res = {
            success: true,
            task: "send",
            messages: [{
                to: doc.from,
                message: msg
            }]
        };

    // looks like we parsed a form ok
    if (def) {
        if (doc.errors.length === 0) {
            if (def.autoreply) {
                // we have a custom success autoreply
                msg = def.autoreply;
            } else {
                msg = utils.getMessage('form_received', locale);
            }
        }
    }

    // handle validation errors
    doc.errors.forEach(function(err) {
        // don't send system errors to the client
        if (err.code && err.code.substr(err.code.length - 4) !== '_sys') {
            msg = utils.getMessage(err, locale)
                    .replace('%(form)', doc.form);
        }
    });

    if (msg.length > 160)
        msg = msg.substr(0,160-3) + '...';

    res.messages[0].message = msg;

    return res;

};

/*
 * Create intial/stub data record. Return Ushahidi SMSSync compatible callback
 * response to update facility data in next response.
 */
var req = {};
exports.add_sms = function(doc, request) {

    req = request;

    var sms_message = {
        type: "sms_message",
        locale: (req.query && req.query.locale) || 'en',
        form: smsparser.getForm(req.form.message)
    };
    doc = _.extend(req.form, sms_message);

    var form_data = null,
        def = jsonforms[doc.form],
        baseURL = require('duality/core').getBaseURL(),
        headers = req.headers.Host.split(":"),
        resp = {};

    if (doc.form && def)
        form_data = smsparser.parse(def, doc);

    // provide callback for next part of record creation.
    resp.callback = {
        options: {
            host: headers[0],
            port: headers[1] || "",
            method: "POST",
            headers: {'Content-Type': 'application/json; charset=utf-8'},
            path: baseURL
                    + getCallbackPath(doc.from, def && doc.form, form_data, def)
        },
        data: {uuid: req.uuid}
    };

    // TODO move to final update

    // pass through Authorization header
    if(req.headers.Authorization) {
        resp.callback.options.headers.Authorization = req.headers.Authorization;
    }

    var record = getDataRecord(doc, form_data);

    log('getRespBody');
    log(JSON.stringify(record,null,2));
    log(JSON.stringify(resp,null,2));

    return [record, JSON.stringify(resp)];
};

/*
 * Setup context and run eval on `messages_task` property on form.
 *
 * @param {String} form - jsonforms form key
 * @param {Object} record - Data record object
 *
 * @returns {Object|undefined} - the task object or undefined if we have no
 *                               messages/nothing to send.
 *
 */
var getMessagesTask = function(record) {
    var def = jsonforms[record.form],
        phone = record.from,
        clinic = record.related_entities.clinic,
        keys = utils.getFormKeys(record.form),
        labels = utils.getLabels(keys, record.form),
        values = utils.getValues(record, keys),
        task = {
            state: 'pending',
            messages: []
        };
    if (typeof def.messages_task === 'string')
        task.messages = task.messages.concat(eval('('+def.messages_task+')()'));
    if (task.messages.length > 0)
        return task;
};

/*
 * Update data record. Create/update attributes on existing doc and
 * send sms response.
 */
exports.updateRecord = function(doc, request) {

    log('updateRecord');
    log(JSON.stringify(doc,null,2));
    log(JSON.stringify(request,null,2));

    req = request;
    var data = JSON.parse(req.body),
        def = jsonforms[doc.form],
        resp = {};

    for (var k in data) {
        if (doc[k] && doc[k].length) {
            doc[k].concat(data[k]);
        } else {
            doc[k] = data[k];
        }
    }

    if (def && def.messages_task) {
        var task = getMessagesTask(doc);
        if (task) {
            record.tasks.push(task);
            for (var i in task.messages) {
                var msg = task.messages[i];
                // check task fields are defined
                if(!msg.to) {
                    utils.addError(record, 'recipient_not_found_sys');
                    // we don't need redundant error messages
                    break;
                }
            }
        }
    }

    resp.payload = getSMSResponse(doc);
    doc.responses = resp.payload.messages;

    log('response');
    log(JSON.stringify(resp,null,2));

    return [doc, JSON.stringify(resp)];
};
