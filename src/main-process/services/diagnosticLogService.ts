import { app } from "electron";
import path from "node:path";
import { getCurrentSettings, resolveLocalPath } from "./settingsService";
import { diagnosticWriter, writeDiagnosticEvent as recordEvent } from "../diagnostics/diagnosticLogger";
import type { DiagnosticEvent, DiagnosticMetadata } from "../../shared/diagnosticTypes";

export { MAX_DIAGNOSTIC_LOG_BYTES } from "../../shared/diagnosticTypes";
let initialized = false;

export function getDiagnosticLogFilePath() {
  const configuredPath = getCurrentSettings().logFilePath;
  return configuredPath ? resolveLocalPath(configuredPath) : path.join(app.getPath("userData"), "logs", "navo.log");
}

/** 设置读取结束后启用写入，将启动期有限缓冲写到实际配置路径。 */
export function initializeDiagnosticLog() {
  if (initialized) return;
  initialized = true;
  diagnosticWriter.configure(getDiagnosticLogFilePath);
}

export function writeDiagnosticEvent(event: DiagnosticEvent, metadata?: DiagnosticMetadata) {
  initializeDiagnosticLog();
  return recordEvent(event, metadata);
}

export async function getDiagnosticLogStatus() {
  initializeDiagnosticLog();
  return diagnosticWriter.status();
}

export async function flushDiagnosticLog() {
  initializeDiagnosticLog();
  await diagnosticWriter.flush();
}

export function clearDiagnosticLog() {
  initializeDiagnosticLog();
  return diagnosticWriter.clear(getDiagnosticLogFilePath());
}

export async function prepareDiagnosticLogFile() {
  initializeDiagnosticLog();
  const filePath = getDiagnosticLogFilePath();
  await diagnosticWriter.prepare(filePath);
  return filePath;
}
