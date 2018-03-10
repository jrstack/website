import { IRequestServer, IncomingMessage, ServerResponse } from "./httpTypes";

class NotFoundServerClass implements IRequestServer {
    public serveRequest(request: IncomingMessage, response: ServerResponse) {
        response.statusCode = 404;
        response.end(`Not found ${request.method}:${request.url}\r\n`);
        return true;
    }
}

const nfs = new NotFoundServerClass();

export function NotFoundServer() {
    return nfs;
}