export const NAVO_TASK_SERVER = "navo_task";
export const NAVO_TASK_TOKEN_ENV = "NAVO_TASK_CONTEXT_TOKEN";

/** 帮助里单独成词的 mcp 子命令。--mcp-config 与普通 --config 都不算。 */
export function helpOffersMcpCommand(help: string) {
  return /^\s*mcp(?:\s|$)/m.test(help);
}

export function assertTaskContextUrl(url: string) {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/mcp$/.test(url)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  return url;
}

export function assertTaskContextToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  return token;
}
