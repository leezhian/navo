/** 校验并规范化自托管实例地址；允许 http/https，拒绝用户名密码、查询和片段。 */
export function normalizeInstanceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("INTEGRATION_INVALID_HOST");
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { throw new Error("INTEGRATION_INVALID_HOST"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("INTEGRATION_INVALID_HOST");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("INTEGRATION_INVALID_HOST");
  if (!parsed.hostname) throw new Error("INTEGRATION_INVALID_HOST");
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${path}`;
}

export function joinApiPath(base: string, suffix: string) {
  return `${base.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}
