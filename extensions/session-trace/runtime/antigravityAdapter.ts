import type { TraceKind } from "../../../src/shared/extensionTypes";
import { list, object, text } from "./adapters";
import type { Parsed, ParserState } from "./adapters";

/**
 * Antigravity transcript_full.jsonl：每行一个 step，带 created_at 和递增 step_index。
 * 工具调用没有 id，按出现顺序与紧随其后的 GENERIC 结果配对；中间插入其他记录即视为配对结束。
 * status 为 ERROR 时只追加一条错误（优先 error 字段，否则用该条第一条可见内容），思考和回复仍按原类型展示。
 */
export function parseAntigravityRecord(raw: unknown, offset: number, state: ParserState): Parsed[] {
  const row = object(raw),
    status = text(row.status);
  const timestamp = typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at)) ? row.created_at : undefined;
  const statusError = status === "ERROR";
  const base = (kind: TraceKind, body: string, suffix = ""): Parsed => ({
    key: `${offset}${suffix}`,
    kind,
    content: body,
    round: state.round,
    timestamp,
  });
  const pending = row.type === "GENERIC" ? (state.pendingCalls ?? []) : [];
  state.pendingCalls = pending;
  if (row.type === "USER_INPUT") {
    state.round++;
    return finish(base("user", text(row.content)), statusError, row, offset);
  }
  if (row.type === "PLANNER_RESPONSE") {
    const request = `step:${Number.isSafeInteger(row.step_index) ? row.step_index : offset}`;
    const events: Parsed[] = [];
    if (text(row.thinking).trim()) events.push(base("reasoning", text(row.thinking), ":r"));
    if (text(row.content).trim()) events.push(base("assistant", text(row.content), ":a"));
    list(row.tool_calls).forEach((entry, index) => {
      const call = object(entry),
        callId = `${request}:${index}`;
      events.push({ ...base("tool", text(call.args), `:t${index}`), tool: text(call.name), callId });
      pending.push(callId);
    });
    if (!events.length && !statusError) events.push(base("assistant", ""));
    if (statusError) events.push(base("error", errorBody(row, events), ":e"));
    for (const event of events) event.request = request;
    return events;
  }
  if (row.type === "GENERIC") {
    // 工具结果失败只标这一条：ERROR、INVALID 或带 error 字段时本身即为错误，不再追加第二条。
    const failed = statusError || status === "INVALID" || Boolean(text(row.error).trim());
    const body = [text(row.content), text(row.error)].filter(Boolean).join("\n");
    return [{ ...base(failed ? "error" : "tool", body), resultFor: pending.shift(), running: status === "RUNNING" || undefined }];
  }
  if (row.type === "ERROR_MESSAGE") return [base("error", text(row.error ?? row.content))];
  // CHECKPOINT 是上下文检查点摘要。
  if (row.type === "CHECKPOINT") return finish(base("compaction", text(row.content)), statusError, row, offset);
  if (row.type === "SYSTEM_MESSAGE") return finish(base("system", text(row.content)), statusError, row, offset);
  return finish(base("unknown", text(row)), statusError, row, offset);
}

function errorBody(row: ReturnType<typeof object>, events: Parsed[]) {
  return text(row.error).trim() || events[0]?.content || text(row.content).trim() || text(row);
}

/** 非工具结果的 ERROR 步骤保留原类型，并在末尾追加恰好一条错误。 */
function finish(event: Parsed, statusError: boolean, row: ReturnType<typeof object>, offset: number) {
  return statusError ? [event, { ...event, key: `${offset}:e`, kind: "error" as const, content: errorBody(row, [event]) }] : [event];
}
