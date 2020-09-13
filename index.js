const WebSocket = require('ws');
const { escape, unescape } = require('querystring');
const EventEmitter = require('events').EventEmitter;

/**
 * An API connection error
 * @extends Error
 * @property {String} [message="GrafanaAPIError [Unknown Code]: Unknown Error"] The error message
 * @property {Number} [code=null] The error code, null if unknown error code
 * @property {String} [reason="Unknown Error"] The reason for the error
 */
class GrafanaAPIError extends Error {
    /**
     * 
     * @param {String?} [reason="Unknown Error"] The reason for the error
     * @param {Number?} [code=null] The error code, null if unknown error code
     * @param {Any} params Additional parameters for the error
     * @returns {GrafanaAPIError}
     */
    constructor(reason, code, ...params) {
        super(...params);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GrafanaAPIError);
        }
        let _code = code !== undefined ? code : null;
        let _reason = reason;
        let _message = `${this.name} [${_code}]: ${_reason}`;
        Object.defineProperties(this, {
            code: {
                get: function () {
                    return _code;
                }
            },
            reason: {
                get: function () {
                    return _reason;
                }
            },
            message: {
                get: function () {
                    return _message;
                }
            }
        });
    }
}

/**
 * An API client to interface with Grafana API made by AlekEagle
 * @extends EventEmitter
 * @property {String} token The token used to auth with the API
 * @property {Number} clusterID The cluster ID of this instance
 * @property {Number} clusterCount How many cluster instances will connect to the API
 * @property {String} path The path to the API server
 * @property {Null|WebSocket} ws The websocket in charge of communicating with the API
 * @property {Boolean} [reconnect=true] Wether or not to reconnect
 * @property {Number} [waitTime=3] How long to wait before reconnecting to the API after a disconnect
 */
class GrafanaAPIClient extends EventEmitter {
    /**
     * Creates the API client
     * @param {String} token The token used to auth with the API
     * @param {Number} clusterID The cluster ID of this instance 
     * @param {Number} clusterCount How many cluster instances will connect to the API
     * @param {String?} path The path to the API server
     * @returns {GrafanaAPIClient}
     */
    constructor(token, clusterID, clusterCount, path) {
        super();
        let _token = token;
        let _clusterID = Number(clusterID);
        let _clusterCount = Number(clusterCount);
        let _path = path || 'ws://localhost:3000/connect';
        this.__remoteEvalUIDs = [];
        this.reconnect = true;
        this.waitTime = 3;

        Object.defineProperties(this, {
            token: {
                get: function () {
                    return _token;
                }
            },
            clusterID: {
                get: function () {
                    return _clusterID;
                }
            },
            clusterCount: {
                get: function () {
                    return _clusterCount;
                }
            },
            path: {
                get: function () {
                    return _path;
                }
            }
        });
    }
    /**
     * Initiates a connection to the API
     */
    connect() {
        this.ws = new WebSocket(this.path);
        this.ws.on('open', () => {
            this.emit('connect');
            this.waitTime = 3;
            this.ws.on('ping', () => this.ws.pong());
            this.ws.on('message', data => {
                let json = JSON.parse(data);
                switch (json.op) {
                    case 0:
                        this.heartbeatInterval = json.d.heartbeatInterval;
                        this.ws.send(JSON.stringify({ op: 2, d: { token: this.token, clusterCount: this.clusterCount, clusterID: this.clusterID } }));
                        break;
                    case 1:
                        console.debug('Successfully Identified!');
                        this.emit('ready');
                        break;
                    case 4:
                        console.debug('Data sent successfully!');
                        this.emit('send');
                        break;
                    case 7:
                        console.debug('Clustered data updated successfully! ', json.d);
                        this.emit('clustersDataUpdate', json.d);
                        break;
                    case 8:
                        if (json.d) {
                            console.debug('All cluster status updated!');
                            this.emit('clusterStatusUpdate', json.d);
                        }
                        break;
                    case 9:
                        if (this.__remoteEvalUIDs.includes(json.d.uid)) return;
                        this.__remoteEvalCallback = (err, value) => {
                            if (err) {
                                this.ws.send(JSON.stringify({ op: 9, d: { id: json.d.id, uid: json.d.uid, data: err } }));
                            } else {
                                this.ws.send(JSON.stringify({ op: 9, d: { id: json.d.id, uid: json.d.uid, data: value } }));
                            }
                        }
                        this.emit('remoteEval', json.d.data, this.__remoteEvalCallback);
                        break;
                    default:
                        console.error(`Unknown Opcode ${json.op}! Closing and reconnecting!`);
                        this.ws.close(4001, 'Invalid opcode');
                        this.ws = null;
                        break;
                }
            });
        });
        this.ws.on('error', err => {
            this.emit('disconnect');
            this.waitTime += this.waitTime / 2;
            this.ws = null;
            setTimeout(() => this.connect(), this.waitTime * 1000);
            if (this.listeners('error').length < 1) {
                throw err;
            } else {
                this.emit('error', err);
            }
        });
        this.ws.on('close', (code, message) => {
            this.emit('disconnect');
            this.waitTime += this.waitTime / 2;
            this.ws = null;
            if (this.reconnect) {
                setTimeout(() => this.connect(), this.waitTime * 1000);
            }
            let error = new GrafanaAPIError(message, code);
            if (this.listeners('error').length < 1) {
                throw error
            } else {
                this.emit('error', error);
            }
        });
    }
    /**
     * Disconnects from the Grafana API cleanly
     * @param {Boolean?} [reconnect=true] Wether or not the socket should reconnect to the api;
     */
    disconnect(reconnect) {
        this.ws.close(1000);
        this.ws = null;
        this.reconnect = reconnect !== undefined ? reconnect : this.reconnect;
    }
    /**
     * Sends an Error to the API
     * @param {String|Error} err The string of the error
     */
    sendError(err) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== this.ws.OPEN) reject(new Error('API isn\'t connected'));
            if (!err) reject(new Error('err argument is required'));
            this.ws.send(JSON.stringify({ op: 6, d: typeof err === 'string' ? err : require('util').inspect(err) }), wsError => {
                if (wsError) {
                    reject(wsError);
                }else {
                    resolve();
                }
            });
        });
    }
    /**
     * Sends a Log to the API
     * @param {String} log The string of the log
     */
    sendLog(log) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== this.ws.OPEN) reject(new Error('API isn\'t connected'));
            if (!err) reject(new Error('err argument is required'));
            this.ws.send(JSON.stringify({ op: 6, d: typeof log === 'string' ? log : require('util').inspect(log) }), wsError => {
                if (wsError) {
                    reject(wsError);
                }else {
                    resolve();
                }
            });
        });
    }
    /**
     * Sends general stats to the API
     * @param {Number} guildCount How many guilds this cluster is in
     * @param {Number} cpuUsage The current CPU usage of this cluster
     * @param {Number} memUsage The current Memory usage of this cluster
     * @param {Number} ping The average ping of all shards on this cluster
     */
    sendStats(guildCount, cpuUsage, memUsage, ping) {
        return new Promise((resolve, reject) => {
            if (guildCount === undefined || cpuUsage === undefined || memUsage === undefined || ping === undefined) reject("all arguments required");
            if (typeof guildCount !== 'number' || typeof cpuUsage !== 'number' || typeof memUsage !== 'number' || typeof ping !== 'number') reject('all arguements must me numbers');
            if (!this.ws || this.ws.readyState !== this.ws.OPEN) reject(new Error('API isn\'t connected'));
            this.ws.send(JSON.stringify({ op: 3, d: { guildCount, cpuUsage, memUsage, ping } }), wsError => {
                if (wsError) {
                    reject(wsError);
                }else {
                    resolve();
                }
            });
        });
    }
    /**
     * Evaluates a string on another cluster
     * @param {Number} clusterID The id of the other cluster.
     * @param {String} data What you want to evaluate on the other cluster.
     * @returns {Promise}
     */
    remoteEval(clusterID, data) {
        if (!this.ws || this.ws.readyState !== this.ws.OPEN) throw new Error('API isn\'t connected');
        return new Promise((resolve, reject) => {
            let uid = Date.now();
            this.__remoteEvalUIDs.push(uid);
            this.ws.send(JSON.stringify({ op: 9, d: { id: clusterID, data, uid } }));
            this.__getRemoteEvalData = (dat) => {
                let json = JSON.parse(dat);
                if (json.op === 9 && json.d.id === clusterID && json.d.uid === uid) {
                    delete this.__remoteEvalUIDs[this.__remoteEvalUIDs.indexOf(uid)];
                    this.ws.off('message', this.__getRemoteEvalData);
                    resolve(json.d.data);
                } else return;
            }
            this.ws.on('message', this.__getRemoteEvalData);
        })
    }
}

module.exports = {
    Client: GrafanaAPIClient,
    GrafanaAPIError
};