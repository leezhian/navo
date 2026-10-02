import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppSettings } from "../../domain/types";

const SETTINGS_SCHEMA_VERSION = 1;

async function openDatabase(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const file = await open(filePath, "a", 0o600);
  await file.close();
  const database = new DatabaseSync(filePath);
  try {
    database.exec("PRAGMA busy_timeout = 3000");
    const version = database.prepare("PRAGMA user_version").get()?.user_version;
    if (typeof version !== "number" || version > SETTINGS_SCHEMA_VERSION) throw new Error("INVALID_SETTINGS");
    database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL");
    if (version === 0) {
      database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        PRAGMA user_version = ${SETTINGS_SCHEMA_VERSION};
        COMMIT;
      `);
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

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
      // 一次设置更新要么全部提交，要么保留旧值，不能留下部分更新的配置。
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}
