import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { parseStatusLinePayload, type StatusLineAgent, type StatusLineObservation } from "./statusLinePayload";

interface StatusLineScope { sessionId: string; terminalId: string; agent: StatusLineAgent }
export interface StatusLineConnection { url: string; token: string }
const MAX_BODY_BYTES = 1024 * 1024;

/** 独立于任务 MCP 的只写回调：随机回环端口，每次运行独立凭证，只接受该次运行的状态栏。 */
export class SessionStatusLineServer {
  private server?: Server;
  private starting?: Promise<string>;
  private credentials = new Map<string, StatusLineScope>();
  constructor(private readonly receive: (sessionId: string, terminalId: string, observation: StatusLineObservation) => boolean) {}

  async connect(sessionId: string, terminalId: string, agent: StatusLineAgent): Promise<StatusLineConnection> {
    const url = await this.listen();
    this.revoke(sessionId);
    const token = randomBytes(32).toString("hex");
    this.credentials.set(token, { sessionId, terminalId, agent });
    return { url, token };
  }
  revoke(sessionId: string) {
    for (const [token, scope] of this.credentials) if (scope.sessionId === sessionId) this.credentials.delete(token);
  }
  private listen() {
    if (this.starting) return this.starting;
    this.starting = new Promise<string>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handle(request, response).catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
      });
      server.requestTimeout = 5000; server.headersTimeout = 5000;
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        this.server = server; server.unref();
        const address = server.address();
        if (!address || typeof address === "string") { reject(new Error("SESSION_CONTEXT_UNAVAILABLE")); return; }
        resolve(`http://127.0.0.1:${address.port}/statusline`);
      });
    }).catch((error) => { this.starting = undefined; throw error; });
    return this.starting;
  }
  private async handle(request: IncomingMessage, response: ServerResponse) {
    const address = this.server?.address();
    const host = address && typeof address !== "string" ? `127.0.0.1:${address.port}` : "";
    if (request.headers.host !== host || request.headers.origin || request.url !== "/statusline") { response.writeHead(403).end(); return; }
    const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const scope = this.credentials.get(token);
    if (!scope) { response.writeHead(401).end(); return; }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    if (!request.headers["content-type"]?.startsWith("application/json")) { response.writeHead(415).end(); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { response.writeHead(413).end(); return; }
      chunks.push(Buffer.from(chunk));
    }
    // 读取请求体期间进程可能已经停止；失效凭证不能把迟到的占用发回界面。
    if (this.credentials.get(token) !== scope) { response.writeHead(401).end(); return; }
    let payload: unknown;
    try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { response.writeHead(400).end(); return; }
    const observation = parseStatusLinePayload(scope.agent, payload);
    if (!observation) { response.writeHead(422).end(); return; }
    const accepted = this.receive(scope.sessionId, scope.terminalId, observation);
    response.writeHead(accepted ? 204 : 409).end();
  }
  async close() {
    this.credentials.clear();
    if (this.starting) await this.starting.catch(() => undefined);
    const server = this.server; this.server = undefined; this.starting = undefined;
    if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
}
