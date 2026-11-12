import { open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_LINE, NEWLINE, READ_CHUNK } from "./limits";

export interface GrokTurnTiming {
  /** turn_started 的时间。 */
  at: string;
  /** turn_started.turn_number，需与 chat_history 用户消息的 prompt_index 一致才采用。 */
  turn: number;
}
export interface GrokToolTiming {
  /** 由完成时间减去 duration_ms，或由 updates.jsonl 的 tool_call 得到的开始时间。 */
  start: string;
  durationMs?: number;
  error?: boolean;
}
const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const isoFromMs = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isFinite(Date.parse(new Date(value).toISOString()))
    ? new Date(value).toISOString()
    : undefined;

/**
 * 追加型 JSONL 的增量游标；文件被替换、截断或目录不一致时从头读。
 * 符号链接指向其他目录时按文件不存在处理，避免跟到别的会话。
 */
class JsonlCursor {
  offset = 0;
  private identity = "";
  private pending = Buffer.alloc(0);
  constructor(readonly filename: string) {}
  reset() {
    this.offset = 0;
    this.identity = "";
    this.pending = Buffer.alloc(0);
  }
  async pull(consume: (line: Buffer) => void, onReset?: () => void): Promise<"missing" | "reset" | "append" | "unchanged"> {
    let info;
    try {
      if (path.dirname(await realpath(this.filename)) !== (await realpath(path.dirname(this.filename)))) return this.missing(onReset);
      info = await stat(this.filename);
      if (!info.isFile()) return this.missing(onReset);
    } catch {
      return this.missing(onReset);
    }
    const identity = `${info.dev}:${info.ino}`;
    let mode: "reset" | "append" | "unchanged" = "unchanged";
    if (identity !== this.identity || info.size < this.offset) {
      this.reset();
      this.identity = identity;
      mode = "reset";
      onReset?.();
    }
    if (info.size === this.offset) return mode;
    const file = await open(this.filename, "r");
    try {
      while (this.offset < info.size) {
        const chunk = Buffer.alloc(Math.min(READ_CHUNK, info.size - this.offset));
        const read = await file.read(chunk, 0, chunk.length, this.offset);
        if (!read.bytesRead) break;
        this.offset += read.bytesRead;
        this.pending = Buffer.concat([this.pending, chunk.subarray(0, read.bytesRead)]);
        let end: number;
        while ((end = this.pending.indexOf(NEWLINE)) >= 0) {
          consume(this.pending.subarray(0, end));
          this.pending = this.pending.subarray(end + 1);
        }
        if (this.pending.length > MAX_LINE) this.pending = Buffer.alloc(0);
      }
    } finally {
      await file.close();
    }
    return mode === "reset" ? "reset" : "append";
  }
  private missing(onReset?: () => void): "missing" | "reset" {
    const had = this.identity !== "" || this.offset > 0;
    this.reset();
    if (had) onReset?.();
    return had ? "reset" : "missing";
  }
}

/**
 * Grok 的时间先从 events.jsonl 精确配对，仍缺的再从 updates.jsonl 补全：
 * events 轮次按 conversation_message_count + turn_number，工具按 tool_call_id；
 * updates 用户按 user_message_chunk._meta.promptIndex，工具按 tool_call.toolCallId，时间取 params._meta.agentTimestampMs。
 * 对不上的保持缺失；events 已对上的不被 updates 覆盖。
 */
export class GrokTiming {
  readonly turns = new Map<number, GrokTurnTiming>();
  readonly users = new Map<number, string>();
  private eventTools = new Map<string, GrokToolTiming>();
  private updateTools = new Map<string, GrokToolTiming>();
  private events: JsonlCursor;
  private updates: JsonlCursor;
  constructor(directory: string) {
    this.events = new JsonlCursor(path.join(directory, "events.jsonl"));
    this.updates = new JsonlCursor(path.join(directory, "updates.jsonl"));
  }
  /** 工具时间优先用 events.jsonl；没有时才用 updates.jsonl。 */
  tool(callId: string) {
    return this.eventTools.get(callId) ?? this.updateTools.get(callId);
  }
  private applyEvent(line: Buffer) {
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line.toString("utf8"));
    } catch {
      return; // 坏行或写入中的行不提供时间，不影响正文解析。
    }
    if (!row || typeof row !== "object" || !validTime(row.ts)) return;
    if (row.type === "turn_started" && Number.isSafeInteger(row.conversation_message_count) && Number.isSafeInteger(row.turn_number)) {
      // 回退后同一位置可能重新开始一轮，以最后一次为准。
      this.turns.set(row.conversation_message_count as number, { at: row.ts, turn: row.turn_number as number });
      return;
    }
    if (row.type === "tool_completed" && typeof row.tool_call_id === "string" && row.tool_call_id && typeof row.duration_ms === "number" && row.duration_ms >= 0) {
      const start = new Date(Date.parse(row.ts) - row.duration_ms).toISOString();
      this.eventTools.set(row.tool_call_id, { start, durationMs: row.duration_ms, error: row.outcome === "error" });
    }
  }
  private applyUpdate(line: Buffer) {
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line.toString("utf8"));
    } catch {
      return;
    }
    const params = object(row.params),
      update = object(params.update),
      at = isoFromMs(object(params._meta).agentTimestampMs);
    if (!at) return;
    if (update.sessionUpdate === "user_message_chunk") {
      const promptIndex = object(update._meta).promptIndex;
      // 同一 promptIndex 只取第一条，不按后续分片或邻近记录改时间。
      if (Number.isSafeInteger(promptIndex) && !this.users.has(promptIndex as number)) this.users.set(promptIndex as number, at);
      return;
    }
    if (typeof update.toolCallId !== "string" || !update.toolCallId) return;
    const callId = update.toolCallId;
    if (update.sessionUpdate === "tool_call") {
      if (!this.updateTools.has(callId)) this.updateTools.set(callId, { start: at });
      return;
    }
    if (update.sessionUpdate === "tool_call_update" && (update.status === "completed" || update.status === "failed")) {
      const started = this.updateTools.get(callId);
      if (!started) return; // 没有精确对应的 tool_call，不用完成事件反推开始时间。
      const durationMs = Date.parse(at) - Date.parse(started.start);
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      started.durationMs = durationMs;
      started.error = update.status === "failed";
    }
  }
  /** 读取新增内容；返回 true 表示可用时间有变化（含文件被替换或删除），调用方需要重建索引。 */
  async refresh() {
    const before = this.snapshot();
    await this.events.pull(
      (line) => this.applyEvent(line),
      () => {
        this.turns.clear();
        this.eventTools.clear();
      },
    );
    await this.updates.pull(
      (line) => this.applyUpdate(line),
      () => {
        this.users.clear();
        this.updateTools.clear();
      },
    );
    return this.snapshot() !== before;
  }
  private snapshot() {
    return JSON.stringify({
      turns: [...this.turns],
      users: [...this.users],
      eventTools: [...this.eventTools],
      updateTools: [...this.updateTools],
    });
  }
}
