"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@broid/utils");
const broid_schemas_1 = require("@sava.team/broid-schemas");
const Promise = require("bluebird");
const R = require("ramda");
const uuid = require("uuid");
class Parser {
    constructor(serviceName, serviceID, logLevel) {
        this.serviceID = serviceID;
        this.generatorName = serviceName;
        this.logger = new utils_1.Logger('parser', logLevel);
    }
    validate(event) {
        this.logger.debug('Validation process', { event });
        const parsed = utils_1.cleanNulls(event);
        if (!parsed || R.isEmpty(parsed)) {
            return Promise.resolve(null);
        }
        if (!parsed.type) {
            this.logger.debug('Type not found.', { parsed });
            return Promise.resolve(null);
        }
        return broid_schemas_1.default(parsed, 'activity')
            .then(() => parsed)
            .catch(err => {
            this.logger.error(err);
            return null;
        });
    }
    parse(event) {
        this.logger.debug('Normalize process', { event });
        const normalized = utils_1.cleanNulls(event);
        if (!normalized || R.isEmpty(normalized)) {
            return Promise.resolve(null);
        }
        const activitystreams = this.createActivityStream(normalized);
        activitystreams.actor = {
            id: R.toString(R.path(['from', 'id'], normalized)),
            name: utils_1.concat([R.path(['from', 'first_name'], normalized), R.path(['from', 'last_name'], normalized)]),
            type: 'Person'
        };
        const chatType = R.path(['chat', 'type'], normalized) || '';
        activitystreams.target = {
            id: R.toString(R.path(['chat', 'id'], normalized)),
            name: R.path(['chat', 'title'], normalized) ||
                utils_1.concat([R.path(['chat', 'first_name'], normalized), R.path(['chat', 'last_name'], normalized)]),
            type: R.toLower(chatType) === 'private' ? 'Person' : 'Group'
        };
        return utils_1.fileInfo(normalized.text, this.logger)
            .then(infos => {
            const mimetype = infos.mimetype;
            if (mimetype.startsWith('image/') || mimetype.startsWith('video/') || mimetype.startsWith('audio/')) {
                activitystreams.object = {
                    id: normalized.message_id,
                    mediaType: mimetype,
                    name: normalized.text.split('/').pop(),
                    type: mimetype.startsWith('image/') ? 'Image' : mimetype.startsWith('video/') ? 'Video' : 'Audio',
                    url: normalized.text
                };
            }
            else {
                activitystreams.object = {
                    content: normalized.text,
                    id: normalized.message_id,
                    type: 'Note'
                };
            }
            return activitystreams;
        })
            .then(as2 => {
            if (as2.object && normalized.chat_instance) {
                as2.object.context = {
                    content: normalized.chat_instance.toString(),
                    name: 'chat_instance',
                    type: 'Object'
                };
            }
            return as2;
        });
    }
    normalize(evt) {
        this.logger.debug('Event received to normalize');
        const event = utils_1.cleanNulls(evt);
        if (!event || R.isEmpty(event)) {
            return Promise.resolve(null);
        }
        event.timestamp = event.date || Math.floor(Date.now() / 1000);
        event.message_id = event.message_id || this.createIdentifier();
        if (!R.is(String, event.message_id)) {
            event.message_id = R.toString(event.message_id);
        }
        if (event._event === 'callback_query' ||
            event._event === 'inline_query' ||
            event._event === 'chosen_inline_result') {
            let messageID = event.id || event.message_id;
            if (!R.is(String, messageID)) {
                messageID = R.toString(messageID);
            }
            return Promise.resolve({
                chat: R.path(['message', 'chat'], event),
                chat_instance: event.chat_instance,
                from: event.from,
                message_id: messageID,
                text: event.data,
                timestamp: R.path(['message', 'date'], event) || event.timestamp
            });
        }
        return Promise.resolve(event);
    }
    createIdentifier() {
        return uuid.v4();
    }
    createActivityStream(normalized) {
        return {
            '@context': 'https://www.w3.org/ns/activitystreams',
            generator: {
                id: this.serviceID,
                name: this.generatorName,
                type: 'Service'
            },
            published: normalized.timestamp || Math.floor(Date.now() / 1000),
            type: 'Create'
        };
    }
}
exports.Parser = Parser;
