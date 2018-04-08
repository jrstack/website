import { makeRequest, PromiseRes } from "@jrstack/http-request";
import { IRequestServer, IncomingMessage, ServerResponse, IRequestServerOptions } from "./httpTypes";
import { Action } from "../types/types";
import { StringMap } from "@jrstack/http-request/types/types";
import * as url from "url";

let log = console.log;
//log = () => {};

interface IEntry {
    dir: string;
    entries: string | IEntry[];
};

interface IEntry2 {
    [k: string]: IEntry2;
}

const etagHeader = "etag";

class Entry2 {
    private lastEtag: string;
    private contents: string;
    private valid = false;
    private updating = false;

    public constructor(public readonly path: string) {}

    public getContents() {
        return this.contents;
    }

    public async update() {
        log("Updating entry", this);
        if (!this.path || this.updating) return;
        try {
            this.updating = true;
            const head = await makeRequest("HEAD", this.path);
            const newEtag = head.headers[etagHeader];
            if (newEtag && newEtag !== this.lastEtag) {
                const newFile = await makeRequest("GET", this.path);
                this.lastEtag = newFile.headers[etagHeader] as string;
                this.contents = newFile.responseText;
                this.valid = true;
            }
        } catch (e) {
            if (e instanceof PromiseRes) {
                log(e.headers);
                if (e.status === 404) {
                    this.valid = false;
                }
            } else {
                log("Unwrapped error updating", e);
            }
        } finally {
            this.updating = false;
        }
    }
}

class EntryManager {
    private lastConfigEtag: string;
    private readonly lookupHistory: StringMap<Entry2> = {};
    private lookup: StringMap<Entry2> = {};
    private readonly base: string;
    private static poison = new Entry2(null);
    private updating = false;

    public constructor(public readonly storageUrl: string) {
        const parsed = url.parse(storageUrl);
        this.base = parsed.pathname && storageUrl.substring(0, storageUrl.lastIndexOf("/"));
        if (!this.base) throw new Error("Unable to parse storage url " + storageUrl);
        log(storageUrl, parsed, this.base);
        this.update();
    }

    public async update() {
        try {
            this.updating = true;
            try {
                log("Updating manager");
                const configHead = await makeRequest("HEAD", this.storageUrl);
                const newEtag = configHead.headers[etagHeader] as string;
                if (newEtag && newEtag !== this.lastConfigEtag) {
                    const configGet = await makeRequest<any>("GET", this.storageUrl);
                    const newLookup: StringMap<Entry2> = {};
                    const parse = (base: string, obj: any) => {
                        if (!obj) return;
                        Object.keys(obj).forEach(k => {
                            const valid = EntryManager.stringIfValid(k);
                            if (valid === false) return;
                            const sensitiveLookup = `${base}/${valid}`;
                            const path = `${this.base}${sensitiveLookup}`;
                            const lookup = sensitiveLookup.toLowerCase();
                            const objk = obj[k];
                            if (!objk) {
                                if (!(lookup in newLookup)) {
                                    if (lookup in this.lookupHistory) {
                                        newLookup[lookup] = this.lookupHistory[lookup];
                                    } else {
                                        this.lookupHistory[lookup] = newLookup[lookup] = new Entry2(path);
                                    }
                                } else {
                                    newLookup[lookup] = EntryManager.poison;
                                }
                            } else if (typeof objk === "object") {
                                parse(sensitiveLookup, objk);
                            }
                        });
                    };
                    parse("", configGet.response);

                    const promises = Object.keys(newLookup).map(k => newLookup[k].update());
                    await Promise.all(promises).then(() => this.lookup = newLookup);
                    return;
                }
            } catch (e) {
                log("Error updating", e);
            }
            try {
                await Promise.all(Object.keys(this.lookup).map(k => this.lookup[k].update()));
            } catch (e) {
                log("Error updating2", e);
            }
        } catch (e3) {
            log("Error updating3", e3);
        } finally {
            this.updating = false;
        }
    }

    private static stringIfValid(entry?: any) {
        if (typeof entry !== "string") return false;
        const dir = entry.trim();
        if (dir.length <= 0 || dir.startsWith(".") || dir.indexOf("/") >= 0) return false;
        return dir;
    }

    public getContent(lookup: string) {
        log("get", lookup, this.lookup);
        const have = this.lookup[(lookup || "").toLowerCase()];
        return have && have.getContents();
    }
}

export class AzureStorageServer implements IRequestServer {
    private manager = new EntryManager(this.storageUrl);
    public constructor(public readonly storageUrl: string) {

    }
    serveRequest(request: IncomingMessage, response: ServerResponse, options?: Partial<IRequestServerOptions>): boolean {
        const key = request.url.toLowerCase();
        log("Trying to serve: ", key);
        const contents = this.manager.getContent(key.trim());
        if (contents) {
            response.writeHead(200, "OK");
            response.end(contents);
            return true;
        }
        return false;
    }
}