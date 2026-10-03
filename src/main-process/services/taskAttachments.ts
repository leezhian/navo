import { copyFile, lstat, mkdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { nativeImage } from "electron";
import type { TaskAttachment } from "../../shared/taskTypes";
import type { StoredAttachment } from "./taskRepository";

interface SelectedFile { path: string; name: string; size: number; }
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

export async function attachmentPreview(filePath: string): Promise<string | null> {
  try {
    if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || (await stat(filePath)).size > 10 * 1024 * 1024) return null;
    const image = nativeImage.createFromPath(filePath);
    return image.isEmpty() ? null : image.resize({ width: 120, height: 80, quality: "good" }).toDataURL();
  } catch { return null; }
}

export class TaskAttachmentSelections {
  private readonly owners = new Map<number, Map<string, SelectedFile>>();

  async add(ownerId: number, paths: string[]): Promise<TaskAttachment[]> {
    const selections = this.owners.get(ownerId) ?? new Map<string, SelectedFile>();
    const files = await Promise.all(paths.map(async (filePath) => {
      const details = await stat(filePath);
      if (!details.isFile()) throw new Error("TASK_FILES_ONLY");
      return { path: filePath, name: path.basename(filePath), size: details.size };
    }));
    const result: TaskAttachment[] = [];
    for (const file of files) {
      const id = [...selections].find(([, value]) => value.path === file.path)?.[0] ?? randomUUID();
      selections.set(id, file);
      result.push({ id, name: file.name, size: file.size, preview: await attachmentPreview(file.path) ?? undefined });
    }
    this.owners.set(ownerId, selections);
    return result;
  }

  release(ownerId: number, ids?: string[]) {
    if (!ids) { this.owners.delete(ownerId); return; }
    for (const id of ids) this.owners.get(ownerId)?.delete(id);
  }

  async prepare(ownerId: number, ids: string[]) {
    return Promise.all(ids.map(async (id) => {
      const file = this.owners.get(ownerId)?.get(id);
      if (!file || !(await stat(file.path)).isFile()) throw new Error("TASK_ATTACHMENT_MISSING");
      return { id, ...file };
    }));
  }

  async copy(directory: string, files: Array<SelectedFile & { id: string }>): Promise<StoredAttachment[]> {
    const copied: StoredAttachment[] = [];
    for (const file of files) {
      const storageName = file.id + path.extname(file.name).slice(0, 16);
      const destination = path.join(directory, storageName);
      await copyFile(file.path, destination, constants.COPYFILE_EXCL);
      copied.push({ id: file.id, name: file.name, size: (await stat(destination)).size, storageName });
    }
    return copied;
  }
}

export async function createAttachmentDirectory(directory: string) {
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory);
}

/** 仅应用管理的任务附件目录使用此清理入口，原文件路径不传入这里。 */
export async function removeAttachmentDirectory(directory: string) {
  try {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("TASK_RESOURCE_CHANGED");
    await rm(directory, { recursive: true });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
