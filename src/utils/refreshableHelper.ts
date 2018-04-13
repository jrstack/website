import { StringMap } from "../../types/types";
import { Readable } from "stream";
import { IRequestServer, IncomingMessage, ServerResponse, IRequestServerOptions } from "../httpTypes";

let log = console.log;

export interface Entry {
    readonly safePath: string;
    getStream(): Readable;
}

export interface Manager {
    getEntries(): Promise<StringMap<Entry>>;
}

export class RefreshableHelper implements IRequestServer {
    private readonly refreshEndpoint = `${this.apiBase}/refresh`;
    private readonly diagnosticsEndpoint = `${this.apiBase}/diagnostics`;
    private entries: StringMap<Entry> = {};
    private diagnostic = '{"error": "Not yet loaded..."}';
    private timeout: number = undefined;
    private refreshing = false;

    private static poison: Entry = {
        getStream: () => { throw new Error("Unable to resolve duplicate path"); },
        safePath: undefined,
    };

    constructor(public readonly apiBase: string, private readonly manager: Manager) {
        this.refresh();
    }

    private async refresh() {
        if (this.refreshing) return;
        this.refreshing = true;
        if (typeof this.timeout === "number") {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        try {
            const newEntries = await this.manager.getEntries();
            const managedEntries: StringMap<Entry> = {};
            const newPublic: StringMap<string> = {};
            const indexable: string[] = [];
            Object.keys(newEntries).forEach(k => {
                const entry = newEntries[k];
                const normalizedK = k.trim().toLowerCase();
                if (normalizedK.includes("/."))
                    return;
                if (normalizedK.endsWith("/index.html"))
                    indexable.push(normalizedK);
                if (!(normalizedK in managedEntries)) {
                    managedEntries[normalizedK] = entry;
                    newPublic[normalizedK] = entry.safePath;
                } else {
                    managedEntries[normalizedK] = RefreshableHelper.poison;
                }
            });
            indexable.forEach(k => {
                const sub = k.substring(0, k.lastIndexOf("/")) || "/";
                const entry = managedEntries[k];
                if (!(sub in managedEntries) && entry !== RefreshableHelper.poison) {
                    managedEntries[sub] = entry;
                    newPublic[sub] = entry.safePath;
                }
            });
            this.diagnostic = JSON.stringify(newPublic);
            this.entries = managedEntries;
        } catch (e) {
            log(e);
            this.diagnostic = '{"error": "problem loading"}';
        } finally {
            this.refreshing = false;
            this.timeout = setTimeout(this.refresh.bind(this), 5 * 60 * 1000);
        }
   }

    serveRequest(url: string, request: IncomingMessage, response: ServerResponse, options?: Partial<IRequestServerOptions>): boolean {
        if (url === this.refreshEndpoint) {
            response.writeHead(200, "OK");
            response.end("Refreshing...");
            return true;
        } else if (!request.method || request.method.toLowerCase() !== "get") {
            return false;
        } else if (url == this.diagnosticsEndpoint) {
            response.writeHead(200, "OK");
            response.end(this.diagnostic);
            return true;
        } else {
            if (url in this.entries) {
                response.writeHead(200, "OK");
                this.entries[url].getStream().pipe(response);
                return true;
            }
            return false;
        }
    }
}