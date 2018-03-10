import { IncomingMessage, ServerResponse } from "http";

export declare interface IRequestServerOptions {
    ssl: boolean;
}

export declare interface IRequestServer {
    serveRequest(request: IncomingMessage, response: ServerResponse, options?: Partial<IRequestServerOptions>): boolean;
}

export { IncomingMessage, ServerResponse }