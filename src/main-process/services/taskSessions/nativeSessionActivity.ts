import { open, readFile, readdir, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import type { SessionUsage, TaskSession, TaskSessionPhase } from "../../../shared/taskSessionTypes";
import { NATIVE_ACTIVITY_CAPABILITIES } from "../../../shared/taskSessionActivity";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_TAIL_BYTES = 512 * 1024;

export interface NativeSessionActivity {
  /** 仅来自 CLI 写入的结构化事件；没有可确认的回合边界时为空。 */
  phase?: TaskSessionPhase;
  /** 只取事件自带的工具名，不拼接参数或终端文本。 */
  waitingReason?: string;
  /** 最近一次 CLI 明确记录“回合完成”的时间，作为未读依据。 */
  lastReplyAt?: string;
  /** 最近一次用户发起回合的时间。 */
  lastPromptAt?: string;
  /** 最近一条用量。Codex 用上下文窗口；其余只保留 token 计数。 */
  usage?: SessionUsage;
}

async function tail(filename: string) {
  const file = await open(filename, "r");
  try {
    const info = await file.stat();
    if (!info.isFile()) return [];
    const start = Math.max(0, info.size - MAX_TAIL_BYTES);
    const buffer = Buffer.alloc(Math.min(info.size, MAX_TAIL_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    let content = buffer.subarray(0, bytesRead).toString("utf8");
    if (start) content = content.slice(content.indexOf("\n") + 1);
    return content.split("\n").flatMap((line) => {
      try { const value = JSON.parse(line); return value && typeof value === "object" ? [value as Record<string, unknown>] : []; } catch { return []; }
    });
  } finally { await file.close(); }
}

const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const toolName = (value: unknown) => typeof value === "string" && /^[\w.:-]{1,80}$/.test(value) ? value : undefined;
const tokenCount = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1_000_000_000_000 ? value : undefined;

function usageFrom(source: Record<string, unknown> | undefined, contextWindow?: number): SessionUsage | undefined {
  if (!source && contextWindow === undefined) return undefined;
  const usage: SessionUsage = {};
  const input = tokenCount(source?.inputTokens ?? source?.input_tokens);
  const output = tokenCount(source?.outputTokens ?? source?.output_tokens);
  const cached = tokenCount(source?.cachedTokens ?? source?.cached_input_tokens ?? source?.cachedReadTokens);
  const reasoning = tokenCount(source?.reasoningTokens ?? source?.reasoning_output_tokens);
  const window = tokenCount(contextWindow);
  if (input !== undefined) usage.inputTokens = input;
  if (output !== undefined) usage.outputTokens = output;
  if (cached !== undefined) usage.cachedTokens = cached;
  if (reasoning !== undefined) usage.reasoningTokens = reasoning;
  if (window !== undefined) usage.contextWindow = window;
  return Object.keys(usage).length ? usage : undefined;
}

/** 只映射本机 events.jsonl 里出现过的 phase_changed 值；其余相位忽略，避免把未知事件猜成状态。 */
const GROK_PHASES: Record<string, TaskSessionPhase> = {
  streaming_text: "answering",
  streaming_reasoning: "reasoning",
  tool_execution: "executingTool",
  waiting_for_model: "waitingModel",
  permission_prompt: "waitingPermission",
};

/** Grok events.jsonl：phase_changed 细分回合内相位；turn_ended 结束回合，permission_* 补充工具名。 */
function grokActivity(records: Record<string, unknown>[]): NativeSessionActivity {
  const result: NativeSessionActivity = {};
  for (const record of records) {
    switch (record.type) {
      case "turn_started":
        result.phase = "answering"; result.waitingReason = undefined;
        if (isDate(record.ts)) result.lastPromptAt = record.ts;
        break;
      case "phase_changed": {
        const phase = typeof record.phase === "string" ? GROK_PHASES[record.phase] : undefined;
        if (!phase) break;
        result.phase = phase;
        if (phase !== "waitingPermission") result.waitingReason = undefined;
        break;
      }
      case "turn_ended":
        result.phase = "idle"; result.waitingReason = undefined;
        if (record.outcome === "completed" && isDate(record.ts)) result.lastReplyAt = record.ts;
        break;
      case "permission_requested":
        if (result.phase !== undefined) { result.phase = "waitingPermission"; result.waitingReason = toolName(record.tool_name); }
        break;
      case "permission_resolved":
        if (result.phase === "waitingPermission") { result.phase = "answering"; result.waitingReason = undefined; }
        break;
    }
  }
  return result;
}

/** Codex rollout：event_msg 的 task_started／task_complete／turn_aborted。 */
function codexActivity(records: Record<string, unknown>[]): NativeSessionActivity {
  const result: NativeSessionActivity = {};
  for (const record of records) {
    if (record.type !== "event_msg") continue;
    const payload = record.payload as Record<string, unknown> | undefined;
    const type = payload?.type;
    if (type === "task_started") {
      result.phase = "answering";
      if (isDate(record.timestamp)) result.lastPromptAt = record.timestamp;
    }
    else if (type === "task_complete") { result.phase = "idle"; if (isDate(record.timestamp)) result.lastReplyAt = record.timestamp; }
    else if (type === "turn_aborted") result.phase = "idle";
    else if (type === "token_count") {
      const info = payload?.info as Record<string, unknown> | undefined;
      // 累计 total_token_usage 不是最近一轮，没有 last_token_usage 就不显示占用。
      const latest = info?.last_token_usage;
      if (!latest || typeof latest !== "object") continue;
      const usage = usageFrom(latest as Record<string, unknown>, tokenCount(info?.model_context_window));
      if (usage) result.usage = usage;
    }
  }
  return result;
}

/** Claude projects/*.jsonl：真实用户输入开启回合，system turn_duration 结束回合；工具结果不算新回合。 */
function claudeActivity(records: Record<string, unknown>[], sessionId: string): NativeSessionActivity {
  const result: NativeSessionActivity = {};
  for (const record of records) {
    if (record.sessionId !== sessionId || record.isSidechain === true) continue;
    if (record.type === "user" && record.isMeta !== true) {
      const content = (record.message as Record<string, unknown> | undefined)?.content;
      const toolResult = Array.isArray(content) && content.length > 0 && content.every((item) => (item as Record<string, unknown>)?.type === "tool_result");
      if (!toolResult) {
        result.phase = "answering";
        if (isDate(record.timestamp)) result.lastPromptAt = record.timestamp;
      }
    } else if (record.type === "assistant") {
      const messageUsage = (record.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined;
      if (messageUsage) {
        const cached = (tokenCount(messageUsage.cache_read_input_tokens) ?? 0) + (tokenCount(messageUsage.cache_creation_input_tokens) ?? 0);
        const usage = usageFrom({
          input_tokens: messageUsage.input_tokens,
          output_tokens: messageUsage.output_tokens,
          cached_input_tokens: cached || undefined,
        });
        if (usage) result.usage = usage;
      }
    } else if (record.type === "system" && record.subtype === "turn_duration") {
      result.phase = "idle";
      if (isDate(record.timestamp)) result.lastReplyAt = record.timestamp;
    }
  }
  return result;
}

function codexRollout(root: string, id: string, files: string[]) {
  const database = files.filter((file) => /^state_\d+\.sqlite$/.test(file)).sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]))[0];
  if (!database) return null;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path.join(root, database), { readOnly: true });
    const row = db.prepare("SELECT rollout_path FROM threads WHERE id=?").get(id);
    const rollout = typeof row?.rollout_path === "string" ? row.rollout_path : null;
    // 只接受 CODEX_HOME 下的 rollout，避免被元数据引向任意路径。
    return rollout && path.isAbsolute(rollout) && path.resolve(rollout).startsWith(path.resolve(root) + path.sep) ? rollout : null;
  } catch { return null; }
  finally { db?.close(); }
}

/** Grok usage.json 的最后一轮是当前上下文占用；会话累计值不拿来冒充窗口百分比。 */
async function grokUsage(filename: string): Promise<SessionUsage | undefined> {
  try {
    const info = await stat(filename);
    if (!info.isFile() || info.size > 1_048_576) return undefined;
    const parsed = JSON.parse(await readFile(filename, "utf8")) as Record<string, unknown>;
    const turns = Array.isArray(parsed.turns) ? parsed.turns : [];
    const latest = (turns.length ? turns[turns.length - 1] : parsed.session) as Record<string, unknown> | undefined;
    return usageFrom(latest);
  } catch { return undefined; }
}

/** 按能力矩阵读取原生记录；没有能力、未绑定原生 ID 或读不到时返回 null，调用方保持四态。 */
export async function readNativeSessionActivity(session: TaskSession, env: NodeJS.ProcessEnv = process.env): Promise<NativeSessionActivity | null> {
  const agentId = session.agent?.agentId;
  if (session.kind !== "agent" || !agentId || !NATIVE_ACTIVITY_CAPABILITIES[agentId].phases.length) return null;
  if (!session.nativeSessionId || !UUID.test(session.nativeSessionId) || !path.isAbsolute(session.cwd)) return null;
  try {
    if (agentId === "grok") {
      const root = session.nativeHistoryRoot || env.GROK_HOME || path.join(os.homedir(), ".grok");
      const directory = path.join(root, "sessions", encodeURIComponent(session.cwd), session.nativeSessionId);
      const activity = grokActivity(await tail(path.join(directory, "events.jsonl")));
      const usage = await grokUsage(path.join(directory, "usage.json"));
      if (usage) activity.usage = usage;
      return activity;
    }
    if (agentId === "claude") {
      const root = session.nativeHistoryRoot || env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
      const project = session.cwd.replace(/[^a-zA-Z0-9]/g, "-");
      return claudeActivity(await tail(path.join(root, "projects", project, session.nativeSessionId + ".jsonl")), session.nativeSessionId);
    }
    if (agentId === "codex") {
      const root = session.nativeHistoryRoot || env.CODEX_HOME || path.join(os.homedir(), ".codex");
      const rollout = codexRollout(root, session.nativeSessionId, await readdir(root));
      return rollout ? codexActivity(await tail(rollout)) : null;
    }
  } catch { /* 原生记录尚未生成或写入中：保留上次结果，不推断状态。 */ }
  return null;
}
