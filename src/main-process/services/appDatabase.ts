import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { diagnosticOperation, writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import { removeLegacyDemoRecords } from "./migrations/removeLegacyDemoRecords";

export const APP_SCHEMA_VERSION = 10;

export async function openAppDatabase(filePath: string) {
  return diagnosticOperation("database.open", {}, async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const file = await open(filePath, "a", 0o600);
    await file.close();
    const database = new DatabaseSync(filePath);
    try {
      database.exec("PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON");
      const version = database.prepare("PRAGMA user_version").get()?.user_version;
      if (typeof version !== "number" || version > APP_SCHEMA_VERSION) throw new Error("INVALID_SETTINGS");
      database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL");
      if (version < APP_SCHEMA_VERSION) {
        void writeDiagnosticEvent("database.migrate.started", { fromVersion: version, toVersion: APP_SCHEMA_VERSION });
        database.exec("BEGIN IMMEDIATE");
        try {
          database.exec(`
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS agent_configurations (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS agent_preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS agent_capability_cache (
              agent_id TEXT NOT NULL, binary_path TEXT NOT NULL, data TEXT NOT NULL,
              PRIMARY KEY(agent_id, binary_path)
            );
            CREATE TABLE IF NOT EXISTS agent_capability_state (agent_id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS task_state (namespace TEXT PRIMARY KEY, initialized INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS tasks (
              namespace TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
              date TEXT NOT NULL, project_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('TODO','DONE','ARCHIVED')),
              archived_from TEXT, position INTEGER NOT NULL, PRIMARY KEY(namespace, id)
            );
            CREATE TABLE IF NOT EXISTS task_resources (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL,
              PRIMARY KEY(namespace, task_id, position),
              FOREIGN KEY(namespace, task_id) REFERENCES tasks(namespace, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_sessions (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
              PRIMARY KEY(namespace, id),
              FOREIGN KEY(namespace, task_id) REFERENCES tasks(namespace, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_agents (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, data TEXT NOT NULL,
              PRIMARY KEY(namespace, task_id),
              FOREIGN KEY(namespace, task_id) REFERENCES tasks(namespace, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_links (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, link_id TEXT NOT NULL, data TEXT NOT NULL,
              PRIMARY KEY(namespace, task_id, link_id),
              FOREIGN KEY(namespace, task_id) REFERENCES tasks(namespace, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_attachments (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
              size INTEGER NOT NULL, storage_name TEXT NOT NULL,
              PRIMARY KEY(namespace, task_id, id),
              FOREIGN KEY(namespace, task_id) REFERENCES tasks(namespace, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_web_links (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, id TEXT NOT NULL,
              position INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
              PRIMARY KEY(namespace, task_id, id),
              FOREIGN KEY(namespace, task_id) REFERENCES tasks(namespace, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_operations (
              namespace TEXT NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL, manifest TEXT NOT NULL,
              PRIMARY KEY(namespace, id)
            );
            CREATE TABLE IF NOT EXISTS task_notes (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
              PRIMARY KEY(namespace,task_id,id),
              FOREIGN KEY(namespace,task_id) REFERENCES tasks(namespace,id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_file_references (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL,
              PRIMARY KEY(namespace,task_id,id), UNIQUE(namespace,task_id,path),
              FOREIGN KEY(namespace,task_id) REFERENCES tasks(namespace,id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS task_resource_batches (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, request_id TEXT NOT NULL,
              PRIMARY KEY(namespace,task_id,request_id),
              FOREIGN KEY(namespace,task_id) REFERENCES tasks(namespace,id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS managed_workspaces (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, path TEXT NOT NULL, branch TEXT NOT NULL,
              repository TEXT NOT NULL, PRIMARY KEY(namespace, path)
            );
            CREATE TABLE IF NOT EXISTS task_deletions (
              namespace TEXT NOT NULL, task_id TEXT NOT NULL, resource_id TEXT NOT NULL, data TEXT NOT NULL,
              PRIMARY KEY(namespace, task_id, resource_id),
              FOREIGN KEY(namespace, task_id) REFERENCES tasks(namespace, id) ON DELETE CASCADE
            );
            PRAGMA user_version = ${APP_SCHEMA_VERSION};
          `);
          removeLegacyDemoRecords(database);
          database.exec("COMMIT");
          void writeDiagnosticEvent("database.migrate.succeeded", { fromVersion: version, toVersion: APP_SCHEMA_VERSION });
        } catch (error) {
          void writeDiagnosticEvent("database.migrate.failed", { fromVersion: version, toVersion: APP_SCHEMA_VERSION, error });
          database.exec("ROLLBACK"); throw error;
        }
      }
      return database;
    } catch (error) { database.close(); throw error; }
  }, { success: false });
}
