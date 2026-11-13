import { open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TaskSession } from "../../../shared/taskSessionTypes";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_METADATA_BYTES = 256 * 1024;

function title(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 512 && Array.from(normalized).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) ? normalized : null;
}

async function metadataFile(filename: string, tail = false) {
  const file = await open(filename, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || (!tail && info.size > MAX_METADATA_BYTES)) return "";
    const start = tail ? Math.max(0, info.size - MAX_METADATA_BYTES) : 0;
    const buffer = Buffer.alloc(Math.min(info.size, MAX_METADATA_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    const content = buffer.subarray(0, bytesRead).toString("utf8");
    return start ? content.slice(content.indexOf("\n") + 1) : content;
  } finally { await file.close(); }
}

/** 仅读取精确原生 ID 的标题字段，不搜索最近会话、不从 prompt/终端文本推断名称。 */
export async function readNativeSessionTitle(session: TaskSession, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  if (session.kind !== "agent" || !session.nativeSessionId || !UUID.test(session.nativeSessionId) || !path.isAbsolute(session.cwd)) return null;
  try {
    if (session.agent?.agentId === "grok") {
      const root = session.nativeHistoryRoot || env.GROK_HOME || path.join(os.homedir(), ".grok");
      const filename = path.join(root, "sessions", encodeURIComponent(session.cwd), session.nativeSessionId, "summary.json");
      const data = JSON.parse(await metadataFile(filename));
      if (data.info?.id !== session.nativeSessionId || data.info?.cwd !== session.cwd) return null;
      return title(data.generated_title);
    }
    if (session.agent?.agentId === "claude") {
      const root = session.nativeHistoryRoot || env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
      const project = session.cwd.replace(/[^a-zA-Z0-9]/g, "-");
      const filename = path.join(root, "projects", project, session.nativeSessionId + ".jsonl");
      const records = (await metadataFile(filename, true)).split("\n").flatMap((line) => {
        try { const record = JSON.parse(line); return record.sessionId === session.nativeSessionId ? [record] : []; } catch { return []; }
      });
      for (const [type, field] of [["custom-title", "customTitle"], ["ai-title", "aiTitle"]]) {
        const latest = records.filter((record) => record.type === type).reverse().find((record) => title(record[field]));
        if (latest) return title(latest[field]);
      }
    }
  } catch { /* CLI 尚未创建元数据、文件暂不可读或写入中时保留上次真实名称。 */ }
  return null;
}
