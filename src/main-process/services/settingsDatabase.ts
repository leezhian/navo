import type { AppSettings } from "../../domain/types";
import { openAppDatabase as openDatabase } from "./appDatabase";
import { writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";

export async function readSettingsDatabase(filePath: string): Promise<Partial<AppSettings> | null> {
  const database = await openDatabase(filePath);
  try {
    const rows = database.prepare("SELECT key, value FROM settings").all();
    if (rows.length === 0) return null;
    return Object.fromEntries(rows.map(({ key, value }) => {
      if (typeof key !== "string" || typeof value !== "string") throw new Error("INVALID_SETTINGS");
      try { return [key, JSON.parse(value)]; }
      catch { throw new Error("INVALID_SETTINGS"); }
    }));
  } finally {
    database.close();
  }
}

export async function writeSettingsDatabase(filePath: string, settings: AppSettings) {
  const database = await openDatabase(filePath);
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const statement = database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      for (const [key, value] of Object.entries(settings)) statement.run(key, JSON.stringify(value));
      database.exec("COMMIT");
    } catch (error) {
      void writeDiagnosticEvent("database.transaction_failed", { error });
      // 一次设置更新要么全部提交，要么保留旧值，不能留下部分更新的配置。
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}
