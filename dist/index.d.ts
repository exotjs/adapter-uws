import { HttpResponse, type WebSocketBehavior, HttpRequest as UWSRequest, us_socket_context_t } from 'uWebSockets.js';
import { Exot } from '@exotjs/exot';
import { ExotHeaders } from '@exotjs/exot/headers';
import { ExotRequest } from '@exotjs/exot/request';
import { ExotWebSocket } from '@exotjs/exot/websocket';
import type { Adapter, ContextInterface, WebSocketHandler } from '@exotjs/exot/types';
export interface UwsWebSocketUserData {
    ctx: ContextInterface;
    handler: WebSocketHandler;
    ws: ExotWebSocket<any, any>;
}
export declare const adapter: () => UwsAdapter;
export default adapter;
export declare class UwsAdapter implements Adapter {
    #private;
    static defaultWebSocketOptions<UserData = unknown>(): WebSocketBehavior<UserData>;
    close(): Promise<void>;
    fetch(req: Request): Promise<Response>;
    listen(port?: number, host?: string): Promise<number>;
    mount(exot: Exot): void;
    upgradeRequest(ctx: ContextInterface, handler: WebSocketHandler): void;
}
export declare class UwsRequest extends ExotRequest {
    #private;
    readonly raw: UWSRequest;
    readonly rawRes: HttpResponse;
    readonly rawContext?: us_socket_context_t | undefined;
    readonly method: string;
    constructor(raw: UWSRequest, rawRes: HttpResponse, rawContext?: us_socket_context_t | undefined);
    arrayBuffer(): Promise<ArrayBuffer>;
    get body(): ReadableStream<Uint8Array>;
    get headers(): ExotHeaders;
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
