import { app } from "electron";
import path from "node:path";
import type { AppSettings } from "../../domain/types";
import { defaultSettings, normalizeAppSettings } from "../../domain/settings";
import { readJsonFile, writeJsonFile } from "./jsonFileStorage";
import { resolveResourcePath } from "./resourcePaths";
import { resolveDiagnosticLogPath, validateDiagnosticLogPath } from "./diagnosticLogPath";

let savedSettings: AppSettings | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function resolveLocalPath(value: string) {
  return resolveResourcePath(value);
}

export function getCurrentSettings() {
  return savedSettings ?? defaultSettings;
}

export async function loadSettings() {
  let value;
  try { value = await readJsonFile(path.join(app.getPath("userData"), "settings.json")); }
  catch (error) { if (error instanceof SyntaxError) throw new Error("INVALID_SETTINGS"); throw error; }
  if (value !== null) {
    if (typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SETTINGS");
    const normalized = normalizeAppSettings(value as Partial<AppSettings>);
    resolveLocalPath(normalized.repositoriesDirectory);
    resolveLocalPath(normalized.worktreesDirectory);
    if (normalized.logFilePath) normalized.logFilePath = resolveDiagnosticLogPath(normalized.logFilePath);
    savedSettings = normalized;
  }
  return { settings: savedSettings };
}

export function saveSettings(value: unknown): Promise<AppSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Promise.reject(new Error("INVALID_SETTINGS"));
  const next = normalizeAppSettings(value as Partial<AppSettings>);
  resolveLocalPath(next.repositoriesDirectory);
  resolveLocalPath(next.worktreesDirectory);
  const operation = writeQueue.then(async () => {
    if (next.logFilePath) next.logFilePath = await validateDiagnosticLogPath(next.logFilePath);
    await writeJsonFile(path.join(app.getPath("userData"), "settings.json"), next);
    savedSettings = next;
  });
  writeQueue = operation.catch(() => undefined);
  return operation.then(() => next);
}
