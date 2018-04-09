import { makeRequest, PromiseRes } from "@jrstack/http-request";
import { StringMap } from "../types/types";
import * as url from "url";
import * as T from "./utils/refreshableHelper";
import { PassThrough } from "stream";

let log = console.log;
//log = () => {};

const etagHeader = "etag";

class AzureEntry implements T.Entry {
    private lastEtag: string;
    private contents: string;
    private valid = false;
    private updating = false;

    public constructor(public readonly path: string, public readonly safePath: string) {}

    public getStream() {
        const stream = new PassThrough();
        setImmediate(() => stream.end(this.contents));
        return stream;
    }

    public isValid() {
        return this.valid;
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
    private lookup: StringMap<AzureEntry> = {};
    private readonly lookupHistory: StringMap<AzureEntry> = {};
    private readonly base: string;

    public constructor(public readonly storageUrl: string) {
        const parsed = url.parse(storageUrl);
        this.base = parsed.pathname && storageUrl.substring(0, storageUrl.lastIndexOf("/"));
        if (!this.base) throw new Error("Unable to parse storage url " + storageUrl);
        log(storageUrl, parsed, this.base);
    }

    private async updateEntriesTo(newLookup: StringMap<AzureEntry>) {
        const promises = Object.keys(newLookup).map(async k => {
            const entry = newLookup[k]
            await newLookup[k].update();
            if (!entry.isValid()) {
                delete newLookup[k];
            }
        });
        await Promise.all(promises);
        return this.lookup = newLookup;
    }

    public async getEntries() {
        try {
            log("Updating manager");
            const configHead = await makeRequest("HEAD", this.storageUrl);
            const newEtag = configHead.headers[etagHeader] as string;
            if (newEtag && newEtag !== this.lastConfigEtag) {
                const configGet = await makeRequest<any>("GET", this.storageUrl);
                const newLookup: StringMap<AzureEntry> = {};
                const parse = (base: string, obj: any) => {
                    if (!obj || typeof obj !== "object") return;
                    Object.keys(obj).forEach(k => {
                        const valid = EntryManager.stringIfValid(k);
                        if (valid === false) return;
                        const sensitiveLookup = `${base}/${valid}`;
                        const path = `${this.base}${sensitiveLookup}`;
                        const safePath = `storage:/${sensitiveLookup}`;
                        const lookup = sensitiveLookup;
                        const objk = obj[k];
                        if (!objk) {
                            if (lookup in this.lookupHistory) {
                                newLookup[lookup] = this.lookupHistory[lookup];
                            } else {
                                this.lookupHistory[lookup] = newLookup[lookup] = new AzureEntry(path, safePath);
                            }
                        } else if (typeof objk === "object") {
                            parse(sensitiveLookup, objk);
                        }
                    });
                };
                parse("", configGet.response);
                return await this.updateEntriesTo(newLookup);
            }
        } catch (e) {
            log("Error updating", e);
        }
        try {
            return await this.updateEntriesTo(this.lookup);
        } catch (e) {
            log("Error updating2", e);
        }
    }

    private static stringIfValid(entry?: any) {
        if (typeof entry !== "string") return false;
        const dir = entry.trim();
        if (dir.length <= 0 || dir.startsWith(".") || dir.indexOf("/") >= 0) return false;
        return dir;
    }
}

export class AzureStorageServer extends T.RefreshableHelper {
    public constructor(public readonly storageUrl: string) {
        super("/api/azure", new EntryManager(storageUrl));
    }
}