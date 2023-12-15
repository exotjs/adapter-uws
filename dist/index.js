import { Readable } from 'node:stream';
import { App as uWebSockets, SHARED_COMPRESSOR, us_socket_local_port, us_listen_socket_close, } from 'uWebSockets.js';
import { awaitMaybePromise, parseFormData } from '@exotjs/exot/helpers';
import { HttpHeaders } from '@exotjs/exot/headers';
import { HttpRequest } from '@exotjs/exot/request';
const textDecoder = new TextDecoder();
export default () => new UwsAdapter();
export class UwsAdapter {
    static defaultWebSocketOptions() {
        return {
            compression: SHARED_COMPRESSOR,
            idleTimeout: 120,
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
    ws(path, handler) {
        this.#uws.ws(path, {
            ...UwsAdapter.defaultWebSocketOptions(),
            open: handler.open,
            close: handler.close,
            message: handler.message,
            upgrade: async (res, req, context) => {
                if (handler.upgrade) {
                    // TODO:
                    // await handler.upgrade(new UwsRequest(req, res), res);
                }
                res.upgrade({}, req.getHeader('sec-websocket-key'), req.getHeader('sec-websocket-protocol'), req.getHeader('sec-websocket-extensions'), context);
            },
        });
    }
    mount(exot) {
        this.#uws.any('/*', (res, req) => {
            res.pause();
            res.onAborted(() => {
                res.aborted = true;
            });
            const ctx = exot.context(new UwsRequest(req, res));
            return awaitMaybePromise(() => exot.handle(ctx), () => {
                res.resume();
                if (!res.aborted) {
                    this.#writeHead(ctx, res, ctx.set.body);
                    if (ctx.set.body instanceof Readable) {
                        this.#pipeStreamToResponse(ctx, ctx.set.body, res);
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
    #writeHead(ctx, res, body) {
        res.cork(() => {
            res.writeStatus(String(ctx.set.status || 200));
            const headers = ctx.set.headers;
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
export class UwsRequest extends HttpRequest {
    raw;
    res;
    #buffer;
    #headers;
    method;
    #path;
    #querystring;
    #remoteAddress;
    #stream;
    constructor(raw, res) {
        super();
        this.raw = raw;
        this.res = res;
        this.method = this.raw.getCaseSensitiveMethod();
        this.#path = this.raw.getUrl();
        this.#querystring = this.raw.getQuery();
    }
    arrayBuffer() {
        if (!this.#buffer) {
            let chunks = [];
            // force-read headers before the stream is read
            this.headers;
            const res = this.res;
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
            this.res.onAborted(() => {
                this.res.aborted = true;
                ctrl.error(new Error('Request stream aborted.'));
            });
            this.res.onData((chunk, isLast) => {
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
            this.#headers = new HttpHeaders();
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
        return new UwsRequest(this.raw, this.res);
    }
    formData() {
        return this.arrayBuffer()
            .then((body) => parseFormData(String(this.headers.get('content-type') || ''), body));
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
            this.#remoteAddress = textDecoder.decode(this.res.getRemoteAddressAsText());
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