import { useTranslation } from "react-i18next";
import type en from "@/i18n/locales/en/trace.json";

/** 宿主返回的错误码；不在轨迹文案里的统一显示通用提示。 */
export type TraceErrorCode = keyof typeof en.errors | "UNKNOWN";
const known: ReadonlySet<string> = new Set<TraceErrorCode>([
  "INVALID_QUERY", "SOURCE_INVALID", "SOURCE_ROOT_MISSING", "SOURCE_MISSING", "SOURCE_UNREADABLE", "LINE_TOO_LARGE", "CACHE_LIMIT",
  "SESSION_MISSING", "LEASE_EXPIRED", "EVENT_MISSING", "RUNTIME_FAILED", "RUNTIME_TIMEOUT",
  "EXTENSION_DISABLED", "IDENTITY_PENDING", "UNSUPPORTED_PROVIDER",
]);

/** IPC 错误形如 "Error invoking remote method …: Error: CODE"，只取末尾的已知错误码。 */
export function traceErrorCode(error: unknown): TraceErrorCode {
  const code = (error instanceof Error ? error.message : "").split(": ").pop() ?? "";
  return known.has(code) ? (code as TraceErrorCode) : "UNKNOWN";
}

interface TraceErrorProps {
  /** 已归一化的错误码；`UNKNOWN` 只显示通用提示，不附错误码。 */
  code: TraceErrorCode;
}

/** 给用户看具体原因，小字附错误码方便反馈。 */
export function TraceError({ code }: TraceErrorProps) {
  const { t } = useTranslation(["trace"]);
  return (
    <>
      <p className="text-sm text-foreground">{code === "UNKNOWN" ? t("trace:error") : t(`trace:errors.${code}`)}</p>
      {code !== "UNKNOWN" && <p className="font-mono text-[11px] text-muted-foreground">{code}</p>}
    </>
  );
}
