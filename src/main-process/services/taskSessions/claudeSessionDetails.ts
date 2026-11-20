import type { SessionBackgroundWork, TaskSession } from "../../../shared/taskSessionTypes";

const MINUTE_MS = 60_000;
const CACHE_LIFETIMES = [
  { key: "ephemeral_5m_input_tokens", ttl: 5 * MINUTE_MS },
  { key: "ephemeral_1h_input_tokens", ttl: 60 * MINUTE_MS },
];
const BACKGROUND_ID = /^[\w-]{1,80}$/;
const FINISHED = /<status>\s*(completed|failed|stopped|killed|blocked|cancelled|canceled)\s*<\/status>/;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function positiveTokens(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** CLI 会把后台作业通知写成一条独立用户消息，不能按正文内出现的标签匹配。 */
export function claudeTaskNotifications(record: Record<string, unknown>, message: Record<string, unknown> | undefined) {
  if (record.type !== "user" || record.toolUseResult !== undefined) return [];
  const content = message?.content;
  const blocks = typeof content === "string" ? [content] : Array.isArray(content) ? content.map((value) => {
    const block = object(value);
    return block?.type === "text" ? block.text : undefined;
  }) : [];
  return blocks.flatMap((text) => {
    if (typeof text !== "string") return [];
    const standalone = /^\s*<task-notification>([\s\S]*?)<\/task-notification>\s*$/.exec(text);
    if (standalone) return [standalone[1]];
    // 新版 worker 通知通常包在整条 system-reminder 内。
    const reminder = /^\s*<system-reminder>([\s\S]*?)<\/system-reminder>\s*$/.exec(text)?.[1];
    return reminder ? [...reminder.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].map((match) => match[1]) : [];
  });
}

/** 同一请求的多个 assistant 片段只算一次，使用原生报告的 TTL，不按模型推算。 */
export function claudeSessionDetails(records: Record<string, unknown>[], sessionId: string): Pick<TaskSession, "promptCache" | "backgroundWork"> {
  const seenRequests = new Set<string>();
  const background = new Map<string, SessionBackgroundWork>();
  const toolDescriptions = new Map<string, string>();
  const expiry = new Map<number, number>();
  for (const record of records) {
    if (record.sessionId !== sessionId || record.isSidechain === true) continue;
    const message = object(record.message);
    const time = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
    if (record.type === "system" && record.subtype === "compact_boundary") expiry.clear();
    if (record.type === "assistant") {
      if (Array.isArray(message?.content)) for (const value of message.content) {
        const block = object(value);
        const description = object(block?.input)?.description;
        if (block?.type === "tool_use" && ["Bash", "Agent", "Task"].includes(String(block.name))
          && typeof block.id === "string" && typeof description === "string" && description.trim()) {
          toolDescriptions.set(block.id, description.trim().replace(/\s+/g, " ").slice(0, 100));
        }
      }
      const usage = object(message?.usage);
      const request = record.requestId ?? message?.id;
      if (!usage || message?.model === "<synthetic>" || !Number.isFinite(time) || typeof request !== "string" || seenRequests.has(request)
        || !["cache_creation", "cache_read_input_tokens", "cache_creation_input_tokens"].some((key) => key in usage)) continue;
      seenRequests.add(request);
      const creation = object(usage.cache_creation);
      const written = CACHE_LIFETIMES.filter(({ key }) => positiveTokens(creation?.[key]));
      const hit = positiveTokens(usage.cache_read_input_tokens);
      const live = [...expiry].filter(([, deadline]) => deadline > time);
      expiry.clear();
      if (hit) {
        // 命中量不区分 TTL；有多个候选时保留原时间，只有唯一档位才能确定被续期。
        for (const [ttl, deadline] of live) expiry.set(ttl, live.length === 1 ? time + ttl : deadline);
      }
      for (const { ttl } of written) expiry.set(ttl, time + ttl);
    }
    const result = object(record.toolUseResult);
    const id = result?.backgroundTaskId ?? (result?.status === "async_launched" ? result.agentId : undefined);
    if (record.type !== "user") continue;
    if (typeof id === "string" && BACKGROUND_ID.test(id) && Number.isFinite(time) && Array.isArray(message?.content)) {
      const toolResult = message.content.map(object).find((block) => block?.type === "tool_result");
      if (typeof toolResult?.tool_use_id === "string") background.set(id, { id, startedAt: time, title: toolDescriptions.get(toolResult.tool_use_id) });
    }
    for (const notification of claudeTaskNotifications(record, message)) {
      if (!FINISHED.test(notification)) continue;
      const finishedId = /<task-id>\s*([\w-]{1,80})\s*<\/task-id>/.exec(notification)?.[1];
      if (finishedId) background.delete(finishedId);
    }
  }
  const deadlines = [...new Set(expiry.values())].sort((a, b) => a - b);
  return {
    ...(deadlines.length ? { promptCache: { expiresAt: deadlines[0], ...(deadlines.length > 1 ? { latestExpiresAt: deadlines[1] } : {}) } } : {}),
    ...(background.size ? { backgroundWork: [...background.values()] } : {}),
  };
}
