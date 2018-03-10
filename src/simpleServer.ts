import { IRequestServer, IncomingMessage, ServerResponse } from "./httpTypes";
import { Server as NonSslServer, createServer as createNonSslServer } from "http";
import { Server as SslServer, createServer as createSslServer, ServerOptions } from "https";
import { NotFoundServer } from "./notFoundServer";

const serverLog = function (prefix: string, str: string) {
    console.log(`${prefix} - ${new Date().toISOString()} ${str}`);
};

const home =
`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Jim.Roberts.codes</title>
</head>

<body>
Simple home page.
<a href="static/html/index.html">Click here for more.</a>
</body>

</html>`;

const nfs = NotFoundServer();

export class SimpleServer {
    private readonly _servers: (SslServer | NonSslServer)[] = [];

    public constructor(private readonly _otherServer: IRequestServer, private readonly _hostname: string, private readonly _ports: number[], sslOptions: ServerOptions) {
        this._servers.push(createNonSslServer(this._getHandler(false).bind(this)));
        if (sslOptions) {
            this._servers.push(createSslServer(sslOptions, this._getHandler(true).bind(this)));
        }
    }

    private _getHandler(ssl: boolean) {
        const secureStr = ssl ? "ssl" : "nonssl";
        serverLog("GettingHandler", secureStr);
        return (request: IncomingMessage, response: ServerResponse) => {
            try {
                const incomingIp = request.connection.remoteAddress;

                serverLog("IncomingRequest", `Serving request on ${secureStr} port ${request.connection.localPort} for ${request.url} from ${incomingIp}`);
                if (request.url === "/") {
                    serverLog("Serving", "home page");
                    response.writeHead(200, "OK");
                    return response.end(home);
                } else if (request.url === "/crash") {
                    throw new Error("Crashing");
                } else if (this._otherServer.serveRequest(request, response)) {
                    serverLog("Served", request.url);
                    return;
                } else if (nfs.serveRequest(request, response)) {
                    serverLog("Not found", request.url);
                    return;
                }
                throw new Error(`No handler for ${request.method}:${request.url}`);
            } catch (e) {
                serverLog("Crashing", `Got unhandled exception ${e}`);
                response.writeHead(500);
                response.end("Sorry");
                throw e;
            }
        };
    }

    public start() {
        serverLog("start()", "starting");
        return new Promise(resolve => {
            let done = 0;
            this._servers.forEach((s, i) => s.listen(this._ports[i], this._hostname, () => {
                serverLog("start()", "started:" + i);
                if ((++done) >= this._servers.length) {
                    serverLog("start()", "all started");
                    resolve();
                }
            }));
        });
    }

    public stop() {
        serverLog("stop()", "stopping");
        return new Promise(resolve => {
            let done = 0;
            this._servers.forEach(s => s.close(() => {
                serverLog("stop()", "stopping:" + done);
                if ((++done) >= this._servers.length) {
                    serverLog("stop()", "all stopped");
                    resolve();
                }
            }));
        });
    }
}