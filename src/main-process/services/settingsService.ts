import { app } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../../domain/types";
import { defaultSettings, normalizeAppSettings } from "../../domain/settings";
import { readSettingsDatabase, writeSettingsDatabase } from "./settingsDatabase";
import { resolveResourcePath } from "./resourcePaths";
import { resolveDiagnosticLogPath, validateDiagnosticLogPath } from "./diagnosticLogPath";

let savedSettings: AppSettings | null = null;
let settingsQueue: Promise<unknown> = Promise.resolve();

export function resolveLocalPath(value: string) {
  return resolveResourcePath(value);
}

export function getCurrentSettings() {
  return savedSettings ?? defaultSettings;
}

export function loadSettings() {
  return serialize(async () => {
    const databasePath = path.join(app.getPath("userData"), "app.db");
    let value: unknown = await readSettingsDatabase(databasePath);
    const needsMigration = value === null;
    if (needsMigration) {
      try {
        value = JSON.parse(await readFile(path.join(app.getPath("userData"), "settings.json"), "utf8"));
        if (value === null) throw new Error("INVALID_SETTINGS");
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error("INVALID_SETTINGS");
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (value !== null) {
      if (typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SETTINGS");
      const normalized = normalizeAppSettings(value as Partial<AppSettings>);
      resolveLocalPath(normalized.repositoriesDirectory);
      resolveLocalPath(normalized.worktreesDirectory);
      if (normalized.logFilePath) normalized.logFilePath = resolveDiagnosticLogPath(normalized.logFilePath);
      // 仅在数据库没有设置时导入旧 JSON，成功后保留原文件作为备份，不再回读。
      if (needsMigration) await writeSettingsDatabase(databasePath, normalized);
      savedSettings = normalized;
    } else {
      savedSettings = null;
    }
    return { settings: savedSettings };
  });
}

export function saveSettings(value: unknown): Promise<AppSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Promise.reject(new Error("INVALID_SETTINGS"));
  const next = normalizeAppSettings(value as Partial<AppSettings>);
  resolveLocalPath(next.repositoriesDirectory);
  resolveLocalPath(next.worktreesDirectory);
  return serialize(async () => {
    if (next.logFilePath) next.logFilePath = await validateDiagnosticLogPath(next.logFilePath);
    await writeSettingsDatabase(path.join(app.getPath("userData"), "app.db"), next);
    savedSettings = next;
    return next;
  });
}

export async function flushSettings() { await settingsQueue; }

function serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
  const result = settingsQueue.then(operation);
  settingsQueue = result.catch(() => undefined);
  return result;
}
