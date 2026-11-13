import type { RendererDiagnosticReport } from "@/shared/diagnosticTypes";
import { MAX_REPORTED_STACK_LENGTH } from "@/shared/diagnosticTypes";

const reported = new WeakSet<object>();
let bound = false;

export function reportRendererError(kind: RendererDiagnosticReport["kind"], error: unknown) {
  try {
    if (error && typeof error === "object") {
      if (reported.has(error)) return;
      reported.add(error);
    }
    const source = error instanceof Error ? error : null;
    // 不发送 message、页面 URL、任务内容或 React componentStack。
    void window.navo?.diagnostics?.report({
      kind, name: source?.name?.slice(0, 40) ?? "Error",
      stack: source?.stack?.split("\n").slice(1).join("\n").slice(0, MAX_REPORTED_STACK_LENGTH),
    }).catch(() => undefined);
  } catch { /* 上报失败不能再产生一次异常上报。 */ }
}

export function bindRendererDiagnostics() {
  if (bound) return;
  bound = true;
  window.addEventListener("error", (event) => reportRendererError("error", event.error));
  window.addEventListener("unhandledrejection", (event) => reportRendererError("unhandled-rejection", event.reason));
}
