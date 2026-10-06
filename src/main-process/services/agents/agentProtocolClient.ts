import { spawn } from "node:child_process";
import os from "node:os";

const PROBE_TIMEOUT_MS = 20000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
type ProtocolMessage = Record<string, unknown>;

/** 只进行能力握手，不发送任务、用户提示词或工具执行请求。 */
export function openAgentProtocol(binary: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(binary, args, { cwd: os.tmpdir(), env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const pending = new Map<string | number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  let buffer = "";
  let bytes = 0;
  let stopped = false;
  const timeout = setTimeout(close, PROBE_TIMEOUT_MS);
  function close() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    for (const request of pending.values()) request.reject(new Error("AGENT_CAPABILITIES_FAILED"));
    pending.clear();
    child.kill("SIGKILL");
  }
  child.on("error", close);
  child.on("exit", close);
  child.stdin.on("error", close);
  child.stderr.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_OUTPUT_BYTES) close(); });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_OUTPUT_BYTES) { close(); return; }
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const message = JSON.parse(line) as ProtocolMessage;
        const response = message.type === "control_response" ? message.response as ProtocolMessage : message;
        const id = response.request_id ?? response.id;
        const request = pending.get(id as string | number);
        if (!request) continue;
        pending.delete(id as string | number);
        if (response.error || response.subtype === "error") request.reject(new Error("AGENT_CAPABILITIES_FAILED"));
        else request.resolve(message.type === "control_response" ? response.response : response.result);
      } catch { /* 忽略 CLI 的非协议输出，不回传可能含有认证信息的原始内容。 */ }
    }
  });
  function send(message: ProtocolMessage) {
    if (stopped) throw new Error("AGENT_CAPABILITIES_FAILED");
    child.stdin.write(JSON.stringify(message) + "\n");
  }
  function request(id: string | number, message: ProtocolMessage): Promise<unknown> {
    if (stopped) return Promise.reject(new Error("AGENT_CAPABILITIES_FAILED"));
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send(message); });
  }
  return { send, request, close };
}
