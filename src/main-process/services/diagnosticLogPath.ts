import { constants } from "node:fs";
import { access, open, stat } from "node:fs/promises";
import path from "node:path";
import { resolveResourcePath } from "./resourcePaths";
import { MAX_DIAGNOSTIC_ENTRY_BYTES } from "../../shared/diagnosticTypes";
import { isDiagnosticLogEntry } from "../diagnostics/diagnosticLogFormat";

export function resolveDiagnosticLogPath(value: string) {
  const filePath = resolveResourcePath(value);
  if (path.extname(filePath).toLowerCase() !== ".log") throw new Error("INVALID_LOG_FILE");
  return filePath;
}

/** 日志只接受 .log 文件，避免误选源码或已有的其他文件后被写入、清理。 */
export async function validateDiagnosticLogPath(value: string) {
  const filePath = resolveDiagnosticLogPath(value);
  let fileStat;
  try { fileStat = await stat(filePath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (!fileStat) return filePath;
  if (!fileStat.isFile()) throw new Error("INVALID_LOG_FILE");
  await access(filePath, constants.R_OK | constants.W_OK);
  if (fileStat.size === 0) return filePath;
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_DIAGNOSTIC_ENTRY_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firstLine = buffer.toString("utf8", 0, bytesRead).split("\n")[0];
    let entry;
    try { entry = JSON.parse(firstLine); } catch { throw new Error("LOG_FILE_IN_USE"); }
    if (!isDiagnosticLogEntry(entry)) throw new Error("LOG_FILE_IN_USE");
  } finally { await handle.close(); }
  return filePath;
}
