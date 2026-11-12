import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { resolveSource } from "./source";
import type { SourceSession } from "./source";
import { TraceIndex } from "./traceIndex";
import type { TraceQuery } from "../../../src/shared/extensionTypes";

// Electron utilityProcess 的通信口，不开放 HTTP 服务或外部网络入口。
interface Port {
  on(event: "message", listener: (event: { data: Message }) => void): void;
  postMessage(value: unknown): void;
}
interface Message {
  id: number;
  type: "open" | "query";
  session?: SourceSession;
  cache?: string;
  query?: TraceQuery;
}
const port = (process as NodeJS.Process & { parentPort: Port }).parentPort;
let index: TraceIndex | undefined,
  filename = "",
  timer: ReturnType<typeof setInterval> | undefined;
let queue = Promise.resolve();
const knownErrors = new Set(["SOURCE_INVALID", "SOURCE_ROOT_MISSING", "SOURCE_MISSING", "LINE_TOO_LARGE", "CACHE_LIMIT", "EVENT_MISSING"]);
function errorCode(error: unknown) {
  return error instanceof Error && knownErrors.has(error.message) ? error.message : "SOURCE_UNREADABLE";
}
port.on("message", ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (data.type === "open" && data.session && data.cache) {
        filename = await resolveSource(data.session);
        await mkdir(path.dirname(data.cache), { recursive: true, mode: 0o700 });
        const session = data.session;
        index = new TraceIndex(filename, data.cache, session.provider, async () => {
          if ((await resolveSource(session)) !== filename) throw Error("SOURCE_INVALID");
        });
        await index.refresh();
        timer = setInterval(() => {
          queue = queue
            .then(async () => {
              // 路径被替换为符号链接时停止读取，避免跟随到其他历史。
              if ((await realpath(filename)) !== filename) throw Error("SOURCE_INVALID");
              if (await index?.refresh()) port.postMessage({ type: "changed" });
            })
            .catch((error) => {
              clearInterval(timer);
              port.postMessage({ type: "failed", error: errorCode(error) });
            });
        }, 1000);
        port.postMessage({ id: data.id, result: true });
      } else if (data.type === "query" && data.query && index) {
        const query = data.query;
        const result =
          query.kind === "page"
            ? index.page(query)
            : query.kind === "timeline"
              ? index.timeline(query)
              : await index.detail(query.eventId ?? -1);
        port.postMessage({ id: data.id, result });
      } else throw Error("SOURCE_INVALID");
    } catch (error) {
      port.postMessage({ id: data.id, error: errorCode(error) });
    }
  });
});
process.on("exit", () => {
  clearInterval(timer);
  index?.close();
});
