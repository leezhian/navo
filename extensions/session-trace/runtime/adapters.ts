import type { TraceKind } from "../../../src/shared/extensionTypes";

export type Json = Record<string, unknown>;
export const object = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value));
export interface ParserState {
  round: number;
  provider: "claude" | "codex";
}
export interface Parsed {
  key: string;
  kind: TraceKind;
  content: string;
  round: number;
  timestamp?: string;
  request?: string;
  tool?: string;
  callId?: string;
  synthetic?: boolean;
  resultFor?: string;
  usage?: { key: string; tokens: number };
}
function usage(value: unknown) {
  const data = object(value);
  if (typeof data.total_tokens === "number") return data.total_tokens;
  const fields = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
  return fields.some((key) => typeof data[key] === "number")
    ? fields.reduce((sum, key) => sum + (typeof data[key] === "number" ? (data[key] as number) : 0), 0)
    : null;
}
function content(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const block = object(item);
          return text(block.text ?? block.thinking ?? block.content ?? item);
        })
        .join("\n")
    : text(value);
}

/** 只以日志中的消息身份和标记归一化，不读取当前 AGENTS.md 回填历史。 */
export function parseRecord(raw: unknown, offset: number, state: ParserState): Parsed[] {
  const row = object(raw),
    message = object(row.message),
    payload = object(row.payload);
  const timestamp = typeof row.timestamp === "string" && Number.isFinite(Date.parse(row.timestamp)) ? row.timestamp : undefined;
  const base = (kind: TraceKind, body: string, suffix = ""): Parsed => ({
    key: `${offset}${suffix}`,
    kind,
    content: body,
    round: state.round,
    timestamp,
  });
  if (state.provider === "claude") {
    const blocks = list(message.content);
    const synthetic = row.isMeta === true || row.isCompactSummary === true;
    if (row.type === "user" && !synthetic && !blocks.some((block) => object(block).type === "tool_result")) state.round++;
    if (row.type === "assistant" || row.type === "user") {
      if (!Array.isArray(message.content)) return [{ ...base(synthetic ? "context" : row.type, content(message.content)), synthetic }];
      return blocks.map((entry, index) => {
        const block = object(entry),
          type = block.type;
        const kind: TraceKind =
          type === "tool_use"
            ? "tool"
            : type === "tool_result"
              ? block.is_error
                ? "error"
                : "tool"
              : type === "thinking"
                ? "reasoning"
                : synthetic
                  ? "context"
                  : row.type === "user"
                    ? "user"
                    : "assistant";
        const event = base(
          kind,
          type === "tool_use" ? text(block.input) : content(block.text ?? block.thinking ?? block.content ?? block),
          `:${index}`,
        );
        event.synthetic = synthetic || undefined;
        // 同一次响应可分为多条 UUID 记录；请求 ID 只用于分组及 Token 去重。
        if (typeof row.uuid === "string" && row.uuid) event.key = `record:${row.uuid}:${index}`;
        if (typeof message.id === "string") event.request = message.id;
        if (type === "tool_use") {
          event.tool = text(block.name);
          event.callId = text(block.id) || undefined;
          if (event.callId) event.key = `call:${event.callId}`;
        }
        if (type === "tool_result") event.resultFor = text(block.tool_use_id);
        const tokens = usage(message.usage);
        if (event.request && tokens !== null) event.usage = { key: event.request, tokens };
        return event;
      });
    }
    if (row.type === "system")
      return [base(row.subtype === "compact_boundary" ? "compaction" : "system", content(row.content ?? row.message ?? row))];
    return [base("unknown", text(row))];
  }
  if (row.type === "session_meta") return [base("system", text(payload))];
  if (row.type === "turn_context") return [base("context", text(payload))];
  if (row.type === "compacted") return [base("compaction", content(payload.message ?? payload))];
  if (row.type === "event_msg") {
    // Codex 的 event_msg 常是 response_item 的流式副本，Token 单独按累计值覆盖。
    if (payload.type === "token_count") {
      const tokens = usage(object(payload.info).total_token_usage);
      return tokens === null ? [] : [{ ...base("system", ""), usage: { key: "codex-total", tokens } }];
    }
    if (
      ["agent_message", "agent_reasoning", "user_message", "task_started", "task_complete", "item_completed"].includes(text(payload.type))
    )
      return [];
    return [base(payload.type === "error" ? "error" : "unknown", text(payload))];
  }
  if (row.type !== "response_item") return [base("unknown", text(row))];
  const type = payload.type;
  if (type === "message") {
    const synthetic = payload.isMeta === true || payload.synthetic === true;
    if (payload.role === "user" && !synthetic) state.round++;
    const kind =
      synthetic || payload.role === "developer"
        ? "context"
        : payload.role === "user"
          ? "user"
          : payload.role === "system"
            ? "system"
            : "assistant";
    return [{ ...base(kind, content(payload.content)), synthetic: synthetic || undefined }];
  }
  if (type === "reasoning") return [base("reasoning", content(payload.summary ?? payload.content))];
  if (type === "function_call" || type === "custom_tool_call")
    return [{ ...base("tool", text(payload.arguments ?? payload.input)), tool: text(payload.name), callId: text(payload.call_id) }];
  if (type === "function_call_output" || type === "custom_tool_call_output")
    return [{ ...base(payload.is_error === true ? "error" : "tool", content(payload.output)), resultFor: text(payload.call_id) }];
  return [base("unknown", text(payload))];
}
