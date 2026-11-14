import { open, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import type { TaskSession, TaskSessionPhase } from "../../../shared/taskSessionTypes";
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
      case "turn_started": result.phase = "answering"; result.waitingReason = undefined; break;
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
    const type = (record.payload as Record<string, unknown> | undefined)?.type;
    if (type === "task_started") result.phase = "answering";
    else if (type === "task_complete") { result.phase = "idle"; if (isDate(record.timestamp)) result.lastReplyAt = record.timestamp; }
    else if (type === "turn_aborted") result.phase = "idle";
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
      if (!toolResult) result.phase = "answering";
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

/** 按能力矩阵读取原生记录；没有能力、未绑定原生 ID 或读不到时返回 null，调用方保持四态。 */
export async function readNativeSessionActivity(session: TaskSession, env: NodeJS.ProcessEnv = process.env): Promise<NativeSessionActivity | null> {
  const agentId = session.agent?.agentId;
  if (session.kind !== "agent" || !agentId || !NATIVE_ACTIVITY_CAPABILITIES[agentId].phases.length) return null;
  if (!session.nativeSessionId || !UUID.test(session.nativeSessionId) || !path.isAbsolute(session.cwd)) return null;
  try {
    if (agentId === "grok") {
      const root = session.nativeHistoryRoot || env.GROK_HOME || path.join(os.homedir(), ".grok");
      return grokActivity(await tail(path.join(root, "sessions", encodeURIComponent(session.cwd), session.nativeSessionId, "events.jsonl")));
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
