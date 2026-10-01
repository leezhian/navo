import os from "node:os";
import path from "node:path";

export function resolveResourcePath(value: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error("INVALID_DIRECTORY");
  const expanded = value === "~" ? os.homedir() : value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
  if (!path.isAbsolute(expanded)) throw new Error("INVALID_DIRECTORY");
  return path.resolve(expanded);
}

export function validateCloneUrl(value: string) {
  if (typeof value !== "string" || !value.trim() || /\s/.test(value)) throw new Error("INVALID_REPOSITORY_URL");
  const url = value.trim();
  if (/^[\w][\w.-]*@[\w][\w.-]*:[\w./-]+$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (!['https:', 'ssh:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname === "/" || parsed.password || (parsed.protocol === "https:" && parsed.username)) throw new Error();
    if (parsed.hostname.startsWith("-") || parsed.username.startsWith("-") || /[\s%]/.test(parsed.hostname)) throw new Error();
    if (parsed.search || parsed.hash) throw new Error();
    return url;
  } catch {
    throw new Error("INVALID_REPOSITORY_URL");
  }
}

export function validateRepositoryName(value: string) {
  if (typeof value !== "string" || !/^[\p{L}\p{N}._-]+$/u.test(value) || /^\.+$/.test(value) || value.length > 100) throw new Error("INVALID_REPOSITORY_NAME");
  return value;
}

export function redactCloneOutput(value: string) {
  return value.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]*(?:@|$)/g, "$1[redacted]@").replace(/(token|password|authorization)[=:]\s*\S+/gi, "$1=[redacted]");
}
