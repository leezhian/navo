import { app } from "electron";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentSettings, resolveLocalPath } from "./settingsService";
import { DIAGNOSTIC_EVENTS } from "./diagnosticLogPath";

export const MAX_DIAGNOSTIC_LOG_BYTES = 20 * 1024 * 1024;
type DiagnosticEvent = typeof DIAGNOSTIC_EVENTS[number];

let logQueue: Promise<void> = Promise.resolve();
let logFailed = false;

export function getDiagnosticLogFilePath() {
  const configuredPath = getCurrentSettings().logFilePath;
  return configuredPath ? resolveLocalPath(configuredPath) : path.join(app.getPath("userData"), "logs", "navo.log");
}

export async function getDiagnosticLogStatus() {
  await logQueue;
  return { failed: logFailed };
}

/** 写入与手动清理共用队列，避免正在写入的旧事件在清理后回填。 */
function enqueueLogOperation(operation: () => Promise<void>) {
  const result = logQueue.then(async () => {
    await operation();
    logFailed = false;
  });
  logQueue = result.catch(() => {
    logFailed = true;
    console.error("Diagnostic log operation failed");
  });
  return result;
}

export function writeDiagnosticEvent(event: DiagnosticEvent) {
  const entry = JSON.stringify({ time: new Date().toISOString(), event }) + "\n";
  const filePath = getDiagnosticLogFilePath();
  return enqueueLogOperation(async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    let size = 0;
    try { size = (await stat(filePath)).size; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    // 单文件达到上限后从新事件重新记录，不产生额外的轮转文件。
    if (size + Buffer.byteLength(entry) > MAX_DIAGNOSTIC_LOG_BYTES) {
      await writeFile(filePath, entry, { mode: 0o600 });
    } else {
      await appendFile(filePath, entry, { mode: 0o600 });
    }
  }).catch(() => undefined);
}

/** 清空当前配置的日志文件；不删除目录或其他日志。 */
export function clearDiagnosticLog() {
  const filePath = getDiagnosticLogFilePath();
  return enqueueLogOperation(async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "", { mode: 0o600 });
  });
}

/** 文件管理器定位前保证日志文件存在，不修改已有内容。 */
export function prepareDiagnosticLogFile() {
  const filePath = getDiagnosticLogFilePath();
  return enqueueLogOperation(async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, "", { mode: 0o600 });
  }).then(() => filePath);
}
