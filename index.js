require('./Logger')('DEBUG');
const WebSocket = require('ws');
const { escape, unescape } = require('querystring');
const EventEmitter = require('events').EventEmitter;
let waitTime = 3;

/**
 * An API client to interface with Grafana API made by AlekEagle
 * @extends EventEmitter
 * @property {String} token The token used to auth with the API
 * @property {Number} clusterID The cluster ID of this instance
 * @property {Number} clusterCount How many cluster instances will connect to the API
 * @property {String} path The path to the API server
 * @property {Null|WebSocket} ws The websocket in charge of communicating with the API
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
        this.token = token;
        this.clusterID = Number(clusterID);
        this.clusterCount = Number(clusterCount);
        this.path = path || 'ws://localhost:3000/connect';
    }
    /**
     * Initiates a connection to the API
     */
    connect() {
        this.ws = new WebSocket(this.path);
        this.ws.on('open', () => {
            this.ws.on('ping', () => this.ws.pong());
            this.ws.on('message', data => {
                let json = JSON.parse(data);
                switch(json.op) {
                    case 0:
                        this.heartbeatInterval = json.d.heartbeatInterval;
                        this.ws.send(JSON.stringify({op:2, d: {token: this.token, clusterCount: this.clusterCount, clusterID: this.clusterID}}));
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
                        console.info('Clustered data updated successfully! ', json.d);
                        this.emit('clustersUpdate', json.d);
                    break;
                    case 8:
                        console.info('All clusters connected!');
                        this.emit('allReady');
                    break;
                    default:
                        console.error(`Unknown Opcode ${json.d.op}! Closing and reconnecting!`);
                        this.ws.close(4001, 'Invalid opcode');
                        this.ws = null;
                        this.connect();
                    break;
                }
            })
        });
        this.ws.on('error', err => {
            waitTime += waitTime/2;
            this.ws = null;
            setTimeout(() => this.connect(),waitTime*1000);
            console.error(err);
        });
    }
    /**
     * Disconnects from the Grafana API cleanly
     * @param {String} [reconnect=true] Wether or not the socket should reconnect to the api;
     */
    disconnect(reconnect) {
        this.ws.close(1000);
        this.ws = null;
        if(!reconnect) {
            setTimeout(() => this.connect(),waitTime*1000);
        } 
    }
    /**
     * Sends an Error to the API
     * @param {String} err The string of the error
     */
    sendError(err) {
        if (!this.ws || this.ws.readyState !== this.ws.OPEN) throw new Error('API isn\'t connected');
        this.ws.send(JSON.stringify({op:6, d: err}));
    }
    /**
     * Sends a Log to the API
     * @param {String} log The string of the log
     */
    sendLog(log) {
        if (!this.ws || this.ws.readyState !== this.ws.OPEN) throw new Error('API isn\'t connected');
        this.ws.send(JSON.stringify({op:5, d: log}));
    }
    /**
     * 
     * @param {Number} guildCount How many guilds this cluster is in
     * @param {Number} cpuUsage The current CPU usage of this cluster
     * @param {Number} memUsage The current Memory usage of this cluster
     * @param {Number} ping The average ping of all shards on this cluster
     */
    sendStats(guildCount, cpuUsage, memUsage, ping) {
        if (!this.ws || this.ws.readyState !== this.ws.OPEN) throw new Error('API isn\'t connected');
        this.ws.send(JSON.stringify({op: 3, d: {guildCount, cpuUsage, memUsage, ping}}));
    }
}

module.exports = GrafanaAPIClient;