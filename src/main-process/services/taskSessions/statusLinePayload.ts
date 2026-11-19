import type { SessionUsage } from "../../../shared/taskSessionTypes";

export type StatusLineAgent = "claude" | "antigravity";
export interface StatusLineObservation {
  /** 原生会话身份必须与 Navo 绑定的会话一致，不能用子会话的占用覆盖主会话。 */
  nativeSessionId: string;
  usage: SessionUsage;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const tokens = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < 1_000_000_000_000;

/** Claude/Antigravity 原生 statusLine JSON；只取上下文和身份，不推测模型窗口或保存其他状态栏内容。 */
export function parseStatusLinePayload(agent: StatusLineAgent, payload: unknown): StatusLineObservation | null {
  if (!object(payload) || (agent === "antigravity" && payload.product !== "antigravity")) return null;
  const id = agent === "claude" ? payload.session_id : payload.conversation_id;
  if (typeof id !== "string" || !UUID.test(id) || !object(payload.context_window)) return null;
  const context = payload.context_window;
  const size = context.context_window_size, percent = context.used_percentage;
  if (!tokens(size) || size <= 0 || typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  let used = Math.round(size * percent / 100);
  const usage: SessionUsage = { contextTokens: used, contextWindow: size };
  if (object(context.current_usage)) {
    const current = context.current_usage;
    const input = current.input_tokens, read = current.cache_read_input_tokens, created = current.cache_creation_input_tokens;
    if (tokens(input) && (read === undefined || tokens(read)) && (created === undefined || tokens(created))) {
      // 两种 CLI 的状态栏将未缓存输入、缓存读取和缓存创建分开报告；输出不计入当前输入上下文。
      const currentTokens = input + (read ?? 0) + (created ?? 0);
      usage.inputTokens = input; usage.cachedTokens = (read ?? 0) + (created ?? 0);
      // CLI 可能先发出尚未填充的零分项；已有非零原生比例时沿用该比例。
      if (currentTokens > 0 || percent === 0) { used = currentTokens; usage.contextTokens = used; }
    }
  }
  if (used > size) return null;
  return { nativeSessionId: id, usage };
}
