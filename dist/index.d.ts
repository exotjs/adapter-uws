import { HttpResponse, type WebSocketBehavior, type WebSocket, HttpRequest as UWSRequest } from 'uWebSockets.js';
import { Exot } from '@exotjs/exot';
import { HttpHeaders } from '@exotjs/exot/headers';
import { HttpRequest } from '@exotjs/exot/request';
import type { Adapter, WsHandler } from '@exotjs/exot/types';
declare const _default: () => UwsAdapter;
export default _default;
export declare class UwsAdapter implements Adapter {
    #private;
    static defaultWebSocketOptions<UserData = unknown>(): WebSocketBehavior<UserData>;
    close(): Promise<void>;
    fetch(req: Request): Promise<Response>;
    listen(port?: number, host?: string): Promise<number>;
    ws<UserData = unknown>(path: string, handler: WsHandler<WebSocket<UserData>>): void;
    mount(exot: Exot): void;
}
export declare class UwsRequest extends HttpRequest {
    #private;
    readonly raw: UWSRequest;
    readonly res: HttpResponse;
    readonly method: string;
    constructor(raw: UWSRequest, res: HttpResponse);
    arrayBuffer(): Promise<ArrayBuffer>;
    get body(): ReadableStream<Uint8Array>;
    get headers(): HttpHeaders;
    get url(): string;
    blob(): Promise<Blob>;
    clone(): UwsRequest;
    formData(): Promise<FormData>;
    json(): Promise<any>;
    text(): Promise<string>;
    remoteAddress(): string;
    parsedUrl(): {
        path: string;
        querystring: string;
    };
}
