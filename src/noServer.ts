import { IRequestServer } from "./httpTypes";

class NoServerClass implements IRequestServer {
    public serveRequest() {
        return false;
    }
}

const ns = new NoServerClass();

export function NoServer() {
    return ns as IRequestServer;
}