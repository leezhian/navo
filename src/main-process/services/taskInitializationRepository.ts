import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { TaskInitializationStep } from "../../shared/taskContextTypes";
import type { ResourceRecord } from "../../shared/settingsTypes";
import type { WorkspaceStep } from "./taskWorkspaces";
import { openAppDatabase } from "./appDatabase";

export interface StoredInitializationStep extends TaskInitializationStep { script: string }

export function planWorktreeInitialization(steps: WorkspaceStep[], records: ResourceRecord[]): StoredInitializationStep[] {
  return steps.filter((step) => step.resource.mode === "worktree" && step.worktreeCreated && !step.reused).flatMap(({ resource }) =>
    (records.find((record) => record.id === (resource.repositoryId ?? resource.resourceId))?.commands ?? [])
      .filter((command) => command.runOnWorktreeCreation)
      .map((command) => ({ id: randomUUID(), resourceId: resource.resourceId, name: command.name, script: command.script, status: "pending" as const })));
}
/** 与工作区归属一起提交，避免提交后崩溃导致初始化计划丢失。 */
export function insertInitialization(database: DatabaseSync, namespace: string, taskId: string, steps: StoredInitializationStep[]) {
  for (const step of steps) database.prepare("INSERT INTO task_initialization VALUES (?,?,?,?)").run(namespace, taskId, step.id, JSON.stringify(step));
}
export function readInitialization(database: DatabaseSync, namespace: string, taskId: string): TaskInitializationStep[] {
  return database.prepare("SELECT data FROM task_initialization WHERE namespace=? AND task_id=? ORDER BY rowid").all(namespace, taskId)
    .map((row) => { const { id, resourceId, name, status, exitCode } = JSON.parse(String(row.data)) as StoredInitializationStep; return { id, resourceId, name, status, exitCode }; });
}
export class TaskInitializationRepository {
  constructor(private readonly filename: string, private readonly namespace: string) {}
  async list(taskId: string): Promise<StoredInitializationStep[]> {
    const database = await openAppDatabase(this.filename);
    try { return database.prepare("SELECT data FROM task_initialization WHERE namespace=? AND task_id=? ORDER BY rowid").all(this.namespace, taskId).map((row) => JSON.parse(String(row.data))); }
    finally { database.close(); }
  }
  async save(taskId: string, step: StoredInitializationStep) {
    const database = await openAppDatabase(this.filename);
    try { database.prepare("UPDATE task_initialization SET data=? WHERE namespace=? AND task_id=? AND id=?").run(JSON.stringify(step), this.namespace, taskId, step.id); }
    finally { database.close(); }
  }
  async recover() {
    const database = await openAppDatabase(this.filename);
    try {
      // 不自动重跑可能已经产生副作用的脚本，留给用户显式重试。
      database.exec("BEGIN IMMEDIATE");
      for (const row of database.prepare("SELECT task_id,data FROM task_initialization WHERE namespace=?").all(this.namespace)) {
        const step: StoredInitializationStep = JSON.parse(String(row.data));
        if (step.status === "running" || step.status === "pending") {
          step.status = "failed";
          database.prepare("UPDATE task_initialization SET data=? WHERE namespace=? AND task_id=? AND id=?").run(JSON.stringify(step), this.namespace, row.task_id, step.id);
        }
      }
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }
}
