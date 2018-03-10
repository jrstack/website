import * as fs from "fs";
import * as path from "path";
import { IncomingMessage, ServerResponse, ServerRequest } from "http";
import * as T from "./httpTypes";
import { Action, Action1, StringMap } from "../types/types";
import { NotFoundServer } from "./notFoundServer";

class Counter {
    public constructor(private count: number, private readonly done: Action) {
        if (count <= 0) {
            done();
        }
    };
    public Add() {
        if (--this.count === 0) {
            this.done();
        }
    }
}

class DirectoryEnumerator {
    private files: string[] = [];

    public constructor(public readonly root: string) { }

    public GetFiles(cb: Action1<string[]>) {
        return this.GetFilesHelper(this.root, () => cb(this.files));
    }

    private GetFilesHelper(current: string, doneCb: Action): void {
        if (path.basename(current).startsWith(".")) {
            return doneCb();
        }
        return fs.stat(current, (err, stat) => {
            if (!err && stat) {
                if (stat.isDirectory()) {
                    return fs.readdir(current, (err2, localFiles) => {
                        if (!err) {
                            const counter = new Counter(localFiles.length, doneCb);
                            return localFiles.forEach(lf => this.GetFilesHelper(path.join(current, lf), () => counter.Add()));
                        }
                        doneCb();
                    });
                } else if (stat.isFile()) {
                    this.files.push(current);
                }
            }
            doneCb();
        });
    }
}

class FileList {
    private files: StringMap<string> = {};
    private publicFiles: StringMap<string> = {};
    private publicFileString = "";
    private timeout: number = undefined;
    public constructor(public readonly root: string, public readonly cwd: string) {
        this.refresh();
    }
    public lookup(path: string): string {
        return this.files[path];
    }
    public refresh() {
        const newList = new DirectoryEnumerator(this.root);
        if (typeof this.timeout === "number") {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        newList.GetFiles(list => {
            const newFiles: StringMap<string> = {};
            const newPublicFiles: StringMap<string> = {};
            list.forEach(fullPath => {
                const lookup = "/" + path.relative(this.root, fullPath).toLowerCase();
                newPublicFiles[lookup] = path.relative(this.cwd, fullPath);
                newFiles[lookup] = fullPath;
            });
            this.publicFiles = newPublicFiles;
            this.publicFileString = "";
            this.files = newFiles;
            this.timeout = setTimeout(this.refresh.bind(this), 5 * 60 * 1000);
        });
    }
    public getPublicFiles() {
        if (!this.publicFileString) {
            this.publicFileString = JSON.stringify(this.publicFiles);
        }
        return this.publicFileString;
    }
}

export class StaticServer implements T.IRequestServer {
    private files: FileList = new FileList(this.fullRootPath, this.cwd);
    public constructor(public readonly fullRootPath: string, public readonly cwd: string) { }

    public serveRequest(request: T.IncomingMessage, response: T.ServerResponse, options?: T.IRequestServerOptions): boolean {
        const key = request.url.toLowerCase();
        const method = request.method.toLowerCase();
        const isGet = method === "get";
        const isPost = method === "post";
        if (key === "/api/static/refresh") {
            this.files.refresh();
            response.writeHead(200, "OK");
            response.end("Refreshing");
        } else if (!isGet) {
            return false;
        } else if (key === "/api/static/diagnostics") {
            response.writeHead(200, "OK");
            response.end(this.files.getPublicFiles());
        } else {
            const lookup = this.files.lookup(key);
            if (!lookup) {
                return false;
            }
            response.writeHead(200, "OK");
            const stream = fs.createReadStream(lookup);
            stream.on("error", () => {
                NotFoundServer().serveRequest(request, response);
                this.files.refresh();
            });
            stream.pipe(response);
        }
        return true;
    }
}