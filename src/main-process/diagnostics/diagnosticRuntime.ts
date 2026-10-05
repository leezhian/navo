import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import { MAX_REPORTED_STACK_LENGTH } from "../../shared/diagnosticTypes";
import type { RendererDiagnosticReport } from "../../shared/diagnosticTypes";
import { writeDiagnosticEvent, writeFatalDiagnostic } from "./diagnosticLogger";

export function bindProcessDiagnostics() {
  // Monitor 不改变 Node 的默认异常退出行为；不安装吞掉 rejection 的监听器。
  process.on("uncaughtExceptionMonitor", writeFatalDiagnostic);
}

export function bindWindowDiagnostics(window: BrowserWindow) {
  const windowId = window.webContents.id;
  window.webContents.on("render-process-gone", (_event, details) => {
    void writeDiagnosticEvent("renderer.gone", { windowId, reason: details.reason, exitCode: details.exitCode });
  });
  window.on("unresponsive", () => { void writeDiagnosticEvent("renderer.unresponsive", { windowId }); });
  window.on("responsive", () => { void writeDiagnosticEvent("renderer.responsive", { windowId }); });
}

export function registerDiagnosticHandlers() {
  const quotas = new Map<number, { count: number; since: number; dropped: number; timer?: ReturnType<typeof setTimeout> }>();
  const reportDropped = (windowId: number) => {
    const quota = quotas.get(windowId);
    if (!quota) return;
    if (quota.timer) clearTimeout(quota.timer);
    quota.timer = undefined;
    if (quota.dropped) void writeDiagnosticEvent("log.dropped", { windowId, count: quota.dropped });
    quota.dropped = 0;
  };
  ipcMain.handle(ipcChannels.diagnosticsReport, (event, report: RendererDiagnosticReport) => {
    if (event.senderFrame !== event.sender.mainFrame || !report || typeof report !== "object"
      || !["error", "unhandled-rejection", "react-error"].includes(report.kind)
      || typeof report.name !== "string" || report.name.length > 40
      || (report.stack !== undefined && (typeof report.stack !== "string" || report.stack.length > MAX_REPORTED_STACK_LENGTH))) return;
    const windowId = event.sender.id;
    let quota = quotas.get(windowId);
    if (!quota) {
      quota = { count: 0, since: Date.now(), dropped: 0 };
      quotas.set(windowId, quota);
      event.sender.once("destroyed", () => { reportDropped(windowId); quotas.delete(windowId); });
    }
    if (Date.now() - quota.since >= 30000) {
      reportDropped(windowId);
      quota.count = 0; quota.since = Date.now(); quota.dropped = 0;
    }
    if (quota.count >= 30) {
      quota.dropped += 1;
      if (!quota.timer) {
        quota.timer = setTimeout(() => reportDropped(windowId), 30000);
        quota.timer.unref();
      }
      return;
    }
    quota.count += 1;
    const error = { name: report.name, stack: report.stack };
    const name = report.kind === "react-error" ? "renderer.react_error" : report.kind === "unhandled-rejection" ? "renderer.unhandled_rejection" : "renderer.error";
    void writeDiagnosticEvent(name, { windowId, error });
  });
}
