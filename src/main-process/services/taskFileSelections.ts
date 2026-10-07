import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { TaskFileReference } from "../../shared/taskResourceTypes";

export class TaskFileSelections {
  private readonly owners = new Map<number, Map<string, TaskFileReference>>();
  async select(ownerId: number, filename: string): Promise<TaskFileReference> {
    const resolved = await realpath(filename);
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error("TASK_FILES_ONLY");
    const files = this.owners.get(ownerId) ?? new Map<string, TaskFileReference>();
    const existing = [...files.values()].find((file) => file.path === resolved);
    const file = { id: existing?.id ?? randomUUID(), path: resolved, name: path.basename(resolved), size: info.size };
    files.set(file.id, file); this.owners.set(ownerId, files);
    return file;
  }
  async prepare(ownerId: number, ids: string[]) {
    return Promise.all(ids.map(async (id) => {
      const file = this.owners.get(ownerId)?.get(id);
      if (!file || await realpath(file.path) !== file.path) throw new Error("TASK_ATTACHMENT_MISSING");
      const info = await stat(file.path);
      if (!info.isFile()) throw new Error("TASK_FILES_ONLY");
      return { ...file, size: info.size };
    }));
  }
  release(ownerId: number, ids?: string[]) {
    if (!ids) this.owners.delete(ownerId);
    else for (const id of ids) this.owners.get(ownerId)?.delete(id);
  }
}
