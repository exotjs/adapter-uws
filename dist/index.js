import { Readable } from 'node:stream';
import { App as uWebSockets, SHARED_COMPRESSOR, us_socket_local_port, us_listen_socket_close, } from 'uWebSockets.js';
import { awaitMaybePromise, parseFormData } from '@exotjs/exot/helpers';
import { ExotHeaders } from '@exotjs/exot/headers';
import { ExotRequest } from '@exotjs/exot/request';
import { ExotWebSocket } from '@exotjs/exot/websocket';
const textDecoder = new TextDecoder();
export const adapter = () => new UwsAdapter();
export default adapter;
export class UwsAdapter {
    static defaultWebSocketOptions() {
        return {
            compression: SHARED_COMPRESSOR,
            idleTimeout: 30,
            maxBackpressure: 1024,
            maxPayloadLength: 16 * 1024 * 1024, // 16MB
        };
    }
    #uws = uWebSockets();
    #socket;
    async close() {
        if (this.#socket) {
            us_listen_socket_close(this.#socket);
            this.#socket = void 0;
        }
        else {
            this.#uws.close();
        }
    }
    async fetch(req) {
        return new Response('uWebSockets adapter does not support fetch interface.', {
            status: 500,
        });
    }
    async listen(port = 0, host) {
        return new Promise((resolve, reject) => {
            this.#uws.listen(port, (socket) => {
                if (socket) {
                    this.#socket = socket;
                    const localPort = us_socket_local_port(socket);
                    resolve(localPort);
                }
                else {
                    reject(new Error(`Failed to listen to port ${port}`));
                }
            });
        });
    }
    mount(exot) {
        this.#mountRequestHandler(exot);
        this.#mountWebSocketHandler(exot);
    }
    upgradeRequest(ctx, handler) {
        const { raw, rawRes, rawContext } = ctx.req;
        rawRes.upgrade({
            ctx,
            handler,
        }, raw.getHeader('sec-websocket-key'), raw.getHeader('sec-websocket-protocol'), raw.getHeader('sec-websocket-extensions'), rawContext);
    }
    #mountRequestHandler(exot) {
        this.#uws.any('/*', (res, req) => {
            res.pause();
            res.onAborted(() => {
                res.aborted = true;
            });
            const ctx = exot.context(new UwsRequest(req, res));
            return awaitMaybePromise(() => exot.handle(ctx), () => {
                res.resume();
                if (!res.aborted) {
                    this.#writeHead(ctx, res, ctx.res.body);
                    if (ctx.res.body instanceof Readable) {
                        this.#pipeStreamToResponse(ctx, ctx.res.body, res);
                    }
                    else {
                        ctx.destroy();
                    }
                }
            }, (_err) => {
                if (!res.aborted) {
                    res.cork(() => {
                        if (res.headersWritten) {
                            res.end();
                        }
                        else {
                            res.writeStatus('500');
                            res.end('Unexpected server error');
                        }
                    });
                    ctx.destroy();
                }
            });
        });
    }
    #mountWebSocketHandler(exot) {
        this.#uws.ws('/*', {
            close(ws) {
                const userData = ws.getUserData();
                if (userData?.handler?.close) {
                    userData.handler.close(userData.ws, userData.ctx);
                }
            },
            drain(ws) {
                // TODO:
            },
            message(ws, message) {
                const userData = ws.getUserData();
                if (userData?.handler?.message) {
                    userData.handler.message(userData.ws, message, userData.ctx);
                }
            },
            open(ws) {
                const userData = ws.getUserData();
                userData.ws = new ExotWebSocket(exot, ws, userData.ctx);
                if (userData?.handler?.open) {
                    userData?.handler.open(userData.ws, userData.ctx);
                }
            },
            upgrade: async (res, req, context) => {
                res.onAborted(() => {
                    res.aborted = true;
                });
                const ctx = exot.context(new UwsRequest(req, res, context));
                return awaitMaybePromise(() => exot.handle(ctx), () => {
                    // noop
                }, (_err) => {
                    if (!res.aborted) {
                        res.cork(() => {
                            if (res.headersWritten) {
                                res.end();
                            }
                            else {
                                res.writeStatus('500');
                                res.end('Unexpected server error');
                            }
                        });
                        ctx.destroy();
                    }
                });
            },
        });
    }
    #writeHead(ctx, res, body) {
        res.cork(() => {
            res.writeStatus(String(ctx.res.status || 200));
            const headers = ctx.res.headers;
            for (let k in headers.map) {
                const v = headers.map[k];
                if (v !== null) {
                    if (Array.isArray(v)) {
                        for (let _v of v) {
                            res.writeHeader(k, _v);
                        }
                    }
                    else {
                        res.writeHeader(k, v);
                    }
                }
            }
            res.headersWritten = true;
            if (body !== void 0) {
                if (typeof body === 'string') {
                    res.end(body);
                }
                else {
                    const buf = Buffer.from(body);
                    res.end(buf);
                }
            }
        });
    }
    async #pipeStreamToResponse(ctx, stream, res) {
        let bytesWritten = 0;
        res.onAborted(() => {
            res.aborted = true;
            stream.destroy();
        });
        return new Promise((resolve, reject) => {
            stream.on('error', (err) => {
                reject(err);
            });
            stream.on('end', () => {
                if (!res.aborted) {
                    res.cork(() => {
                        res.end();
                    });
                }
                ctx.destroy();
                resolve(bytesWritten);
            });
            stream.on('data', (chunk) => {
                const lastOffset = res.getWriteOffset();
                let ab = Buffer.from(chunk);
                res.cork(() => {
                    const ok = res.write(ab);
                    bytesWritten += ab.byteLength;
                    if (!ok) {
                        // backpressure applied -> pause
                        stream.pause();
                        res.onWritable((offset) => {
                            let _ok = false;
                            res.cork(() => {
                                ab = ab.subarray(offset - lastOffset);
                                if ((_ok = res.write(ab))) {
                                    stream.resume();
                                }
                                bytesWritten += ab.byteLength;
                            });
                            return _ok;
                        });
                    }
                });
            });
        });
    }
}
export class UwsRequest extends ExotRequest {
    raw;
    rawRes;
    rawContext;
    #buffer;
    #headers;
    method;
    #path;
    #querystring;
    #remoteAddress;
    #stream;
    constructor(raw, rawRes, rawContext) {
        super();
        this.raw = raw;
        this.rawRes = rawRes;
        this.rawContext = rawContext;
        this.method = this.raw.getCaseSensitiveMethod();
        this.#path = this.raw.getUrl();
        this.#querystring = this.raw.getQuery();
    }
    arrayBuffer() {
        if (!this.#buffer) {
            let chunks = [];
            // force-read headers before the stream is read
            this.headers;
            const res = this.rawRes;
            this.#buffer = new Promise((resolve) => {
                res.onAborted(() => {
                    res.aborted = true;
                });
                res.onData((chunk, isLast) => {
                    // chunk must be copied using slice
                    chunks.push(Buffer.from(chunk.slice(0)));
                    if (isLast) {
                        resolve(Buffer.concat(chunks));
                    }
                });
            });
        }
        return this.#buffer;
    }
    get body() {
        if (!this.#stream) {
            // force-read headers before the stream is read
            this.headers;
            let ctrl;
            this.#stream = new ReadableStream({
                start(_ctrl) {
                    ctrl = _ctrl;
                },
            });
            this.rawRes.onAborted(() => {
                this.rawRes.aborted = true;
                ctrl.error(new Error('Request stream aborted.'));
            });
            this.rawRes.onData((chunk, isLast) => {
                // chunk must be copied using slice
                ctrl.enqueue(new Uint8Array(chunk.slice(0)));
                if (isLast) {
                    ctrl.close();
                }
            });
        }
        return this.#stream;
    }
    get headers() {
        if (!this.#headers) {
            this.#headers = new ExotHeaders();
            this.raw.forEach((k, v) => {
                this.#headers?.append(k, v);
            });
        }
        return this.#headers;
    }
    get url() {
        return this.#path + '?' + this.#querystring;
    }
    blob() {
        return Promise.resolve(new Blob([]));
    }
    clone() {
        return new UwsRequest(this.raw, this.rawRes);
    }
    formData() {
        return this.arrayBuffer()
            .then((body) => parseFormData(String(this.headers.get('Content-Type') || ''), body));
    }
    json() {
        return this.text()
            .then(JSON.parse);
    }
    text() {
        return this.arrayBuffer()
            .then((buf) => textDecoder.decode(buf));
    }
    remoteAddress() {
        if (!this.#remoteAddress) {
            this.#remoteAddress = textDecoder.decode(this.rawRes.getRemoteAddressAsText());
        }
        return this.#remoteAddress;
    }
    parsedUrl() {
        return {
            path: this.#path,
            querystring: this.#querystring,
        };
    }
}
