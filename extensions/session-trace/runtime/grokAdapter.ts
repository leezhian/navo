import type { TraceKind } from "../../../src/shared/extensionTypes";
import { list, object, text } from "./adapters";
import type { Parsed, ParserState } from "./adapters";
import type { GrokTiming } from "./grokTiming";

/** Grok 正文块只取文本；图片等二进制块只留占位，不把 base64 写进索引。 */
function blocks(value: unknown) {
  if (!Array.isArray(value)) return text(value);
  return list(value)
    .map((item) => {
      const block = object(item);
      return block.type === "text" ? text(block.text) : `[${text(block.type) || "block"}]`;
    })
    .join("\n");
}

/**
 * Grok chat_history.jsonl 没有时间。时间先按 events.jsonl 精确配对，仍缺的再用 updates.jsonl：
 * 用户消息先按行号 + prompt_index 对 turn_started，否则按 prompt_index 对 user_message_chunk；
 * 工具调用按 tool_call_id / toolCallId 配对。对不上的保持缺失，不按顺序推测。
 */
export function parseGrokRecord(raw: unknown, offset: number, state: ParserState, timing?: GrokTiming): Parsed[] {
  const row = object(raw),
    line = state.line ?? 0;
  state.line = line + 1;
  const base = (kind: TraceKind, body: string, suffix = ""): Parsed => ({ key: `${offset}${suffix}`, kind, content: body, round: state.round });
  if (row.type === "system") return [base("system", text(row.content))];
  if (row.type === "user") {
    // synthetic_reason 标记的是 CLI 注入（系统提醒、项目指令、压缩说明等），不算用户新一轮。
    const synthetic = typeof row.synthetic_reason === "string";
    if (!synthetic) state.round++;
    const event: Parsed = { ...base(synthetic ? "context" : "user", blocks(row.content)), synthetic: synthetic || undefined };
    const started = synthetic ? undefined : timing?.turns.get(line);
    if (started && started.turn === row.prompt_index) event.timestamp = started.at;
    else if (!synthetic && typeof row.prompt_index === "number") event.timestamp = timing?.users.get(row.prompt_index);
    return [event];
  }
  if (row.type === "reasoning") return [base("reasoning", blocks(row.summary))];
  if (row.type === "assistant") {
    const events: Parsed[] = [];
    const body = blocks(row.content);
    if (body.trim()) events.push(base("assistant", body, ":0"));
    list(row.tool_calls).forEach((entry, index) => {
      const call = object(entry),
        callId = text(call.id) || undefined,
        timed = callId ? timing?.tool(callId) : undefined;
      const event: Parsed = { ...base(timed?.error ? "error" : "tool", text(call.arguments), `:${index + 1}`), tool: text(call.name), callId };
      if (callId) event.key = `call:${callId}`;
      if (timed) {
        event.timestamp = timed.start;
        event.durationMs = timed.durationMs;
      }
      events.push(event);
    });
    return events.length ? events : [base("assistant", "")];
  }
  if (row.type === "tool_result") return [{ ...base("tool", blocks(row.content)), resultFor: text(row.tool_call_id) || undefined }];
  if (row.type === "backend_tool_call") return [{ ...base("tool", text(row)), tool: text(row.kind) || undefined }];
  return [base("unknown", text(row))];
}
