/// <reference types="node" />

import * as ws from 'ws';
import * as events from 'events';

declare namespace GrafanaAPIClient {
    interface EventListeners<T> {
        (
            event: 'ready' | 'connect' | 'disconnect' | 'send',
            listener: () => void
        ): T;
        (
            event: 'clustersDataUpdate',
            listener: (data: object) => void
        ): T;
        (
            event: 'clusterStatusUpdate',
            listener: (allConnected: boolean) => void
        ): T;
        (
            event: 'remoteEval',
            listener: (data: string, cb:(err?:error, value?:any) => void) => void
        ): T;
        (
            event: 'error',
            listener: (err: Error) => void
        ): T;
    }

    export class Client extends events.EventEmitter {
        static token: string;
        static clusterCount: number;
        static clusterID: number;
        static path: string;

        path: string;
        token: string;
        clusterCount: number;
        clusterID: number;
        waitTime: number;
        ws: ws;

        constructor(
            token: string,
            clusterID: number,
            clusterCount: number,
            path?: string
        );
        connect(): void;
        disconnect(reconnect?: boolean): void;
        sendError(err: string | Error): void;
        sendLog(log: string): void;
        sendStats(
            guildCount: number,
            cpuUsage: number,
            memUsage: number,
            ping: number
        ): void;
        remoteEval(clusterID: number, data: string): Promise<string>;
        on: EventListeners<this>;
        once: EventListeners<this>;
        off: EventListeners<this>;
    }

    export class GrafanaAPIError extends Error {
        static reason: string;
        static message: string;
        static code: number;

        reason: string;
        message: string;
        code: number;

        constructor(reason?: string, code?: number, ...params: any[]);
    }
}

export = GrafanaAPIClient;
