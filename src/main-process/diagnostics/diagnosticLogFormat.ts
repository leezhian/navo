import { isDiagnosticEvent } from "../../shared/diagnosticTypes";

export const LEGACY_DIAGNOSTIC_EVENTS = ["app-start", "app-stop", "settings-saved", "resource-added", "resource-removed", "clone-start", "clone-success", "clone-failure", "clone-cancelled"] as const;

/** 路径校验兼容旧 JSONL，不重写历史内容；新旧条目可共存于同一文件。 */
export function isDiagnosticLogEntry(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.time !== "string" || !Number.isFinite(Date.parse(entry.time))) return false;
  if (Object.keys(entry).length === 2 && typeof entry.event === "string" && (LEGACY_DIAGNOSTIC_EVENTS as readonly string[]).includes(entry.event)) return true;
  return entry.schemaVersion === 1 && isDiagnosticEvent(entry.event)
    && ["INFO", "WARN", "ERROR"].includes(String(entry.level))
    && entry.scope === entry.event.split(".")[0]
    && !!entry.data && typeof entry.data === "object" && !Array.isArray(entry.data)
    && Object.keys(entry).every((key) => ["schemaVersion", "time", "level", "scope", "event", "data", "error"].includes(key));
}
