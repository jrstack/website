import { join } from "path";
import { SimpleServer } from "./simpleServer";
import { StaticServer } from "./staticServer";
import { NoServer } from "./noServer";
import { existsSync, readFileSync } from "fs";
import { AzureStorageServer } from "./azureStorageServer";

const address = process.env["address"] || "0.0.0.0";
const envPort = process.env["port"];
const port = envPort ? parseInt(envPort) : 80;
const envSslPort = process.env["sslport"];
const sslPort = envSslPort ? parseInt(envSslPort) : 443;
const envAzureRootPath = process.env["azureroot"];
const azureRootPath = typeof envAzureRootPath === typeof "" ? envAzureRootPath : null;
const envUseAzure = typeof azureRootPath === typeof "" && process.env["useazure"];
const useAzure = typeof envUseAzure === typeof "" ? (envUseAzure.toLowerCase() === "true") : false;
const envUseFs = process.env["usefs"];
const useFs = typeof envUseFs === typeof "" ? (envUseFs.toLowerCase() === "true") : false;
const envStaticRootPath = process.env["staticroot"];
const staticRootPath = typeof envStaticRootPath === typeof "" ? envStaticRootPath : "http_files";
const privPath = "privkey.pem";
const certPath = "fullchain.pem";

const cwdType = typeof process.cwd;
const cwd = __dirname;
/*
cwdType === (typeof (() => {})) ? process.cwd()
            : cwdType === typeof "" ? (process.cwd as any) as string
            : __dirname;
*/


const fullRootPath = join(cwd, staticRootPath);

console.log("UseFS", useFs, fullRootPath, cwd);
console.log("UseAzure", useAzure, azureRootPath);

let servers = [
    useAzure ? new AzureStorageServer(azureRootPath) : NoServer(),
    useFs ? new StaticServer(fullRootPath, cwd) : NoServer(),
];

const getOpts = () => {
    if (existsSync(privPath) && existsSync(certPath)) {
        const privKey = readFileSync(privPath);
        const cert = readFileSync(certPath);
        return {
            key: privKey,
            cert: cert,
        };
    }
    return null;
}

const server = new SimpleServer(servers, address, [port, sslPort], getOpts());

let stopping = false;
process.on("SIGINT", async () => {
    if (!stopping) {
        stopping = true;
        await server.stop()
        process.exit(0);
    }
});

server.start();
