import { IRequestServer, IncomingMessage, ServerResponse } from "./httpTypes";

class NotFoundServerClass implements IRequestServer {
    public serveRequest(url: string, request: IncomingMessage, response: ServerResponse) {
        response.statusCode = 404;
        response.end(`Not found ${request.method}:${url}\r\n`);
        return true;
    }
}

const nfs = new NotFoundServerClass();

export function NotFoundServer() {
    return nfs;
}