import * as fs from "fs";
import * as path from "path";
import { Action, Action1, StringMap } from "../types/types";
import * as U from "./utils/refreshableHelper";

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
    public constructor(public readonly root: string, public readonly cwd: string) {
    }
    public getEntries() {
        const newList = new DirectoryEnumerator(this.root);
        return new Promise<StringMap<U.Entry>>((resolve, reject) =>
            newList.GetFiles(list => {
                const newFiles: StringMap<U.Entry> = {};
                const newPublicFiles: StringMap<string> = {};
                list.forEach(fullPath => {
                    const lookup = "/" + path.relative(this.root, fullPath).toLowerCase();
                    newPublicFiles[lookup] = path.relative(this.cwd, fullPath);
                    newFiles[lookup] = {
                        safePath: path.relative(this.cwd, fullPath),
                        getStream: () => fs.createReadStream(fullPath),
                    };
                });
                resolve(newFiles);
            }));
    }
}

export class StaticServer extends U.RefreshableHelper {
    public constructor(public readonly fullRootPath: string, public readonly cwd: string) {
        super("/api/static", new FileList(fullRootPath, cwd));
    }
}