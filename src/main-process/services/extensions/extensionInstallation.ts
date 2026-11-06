import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionRepository, InstalledExtension } from "./extensionRepository";
import type { TrustedRelease } from "./extensionCatalog";
import { downloadExtension } from "./extensionDownload";
import { MAX_PACKAGE_BYTES, unpackPackage } from "./extensionPackage";

async function exists(filename: string) {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
/** 数据库提交前保留 backup；崩溃后依据操作记录恢复旧包，提交后的残留备份只需清理。 */
export async function recoverInstallation(directory: string, repository: ExtensionRepository, record: InstalledExtension) {
  const stage = path.join(directory, "staging"),
    installed = path.join(directory, "installed"),
    backup = path.join(directory, "backup");
  if (record.operation === "updating") {
    if (await exists(backup)) {
      await rm(installed, { recursive: true, force: true });
      await rename(backup, installed);
    }
    await rm(stage, { recursive: true, force: true });
    const restored: InstalledExtension = { ...record, operation: "idle" };
    await repository.save(restored);
    return restored;
  }
  if (record.operation === "installing") {
    await rm(stage, { recursive: true, force: true });
    if (!record.version) await rm(installed, { recursive: true, force: true });
    const restored: InstalledExtension = { ...record, operation: "idle", enabled: false };
    await repository.save(restored);
    return restored;
  }
  if (record.operation === "idle") await rm(backup, { recursive: true, force: true }).catch(() => undefined);
  return record;
}
interface InstallationOptions {
  directory: string;
  repository: ExtensionRepository;
  previous: InstalledExtension;
  target: TrustedRelease;
  filename?: string;
  signal: AbortSignal;
  progress: (value: number) => void;
  /** 仅在持久化状态改变后通知宿主；旧启用偏好始终留在操作记录中。 */
  publish: (record: InstalledExtension) => void;
  deactivate: () => void | Promise<void>;
}
export async function replaceInstallation({
  directory,
  repository,
  previous,
  target,
  filename,
  signal,
  progress,
  publish,
  deactivate,
}: InstallationOptions) {
  const stage = path.join(directory, "staging"),
    installed = path.join(directory, "installed"),
    backup = path.join(directory, "backup");
  const journal: InstalledExtension = { ...previous, operation: previous.version ? "updating" : "installing" };
  // 首次保存失败时还未改动内存和文件，调用者可以直接重试。
  await repository.save(journal);
  publish(journal);
  let moved = false,
    replaced = false;
  try {
    if (filename) {
      const info = await lstat(filename);
      if (!info.isFile() || info.size > MAX_PACKAGE_BYTES) throw Error("PACKAGE_INVALID");
    }
    const bytes = filename ? await readFile(filename) : await downloadExtension(target.release, signal, progress);
    signal.throwIfAborted();
    await rm(stage, { recursive: true, force: true });
    await unpackPackage(bytes, target.release, stage);
    if (target.catalog) await writeFile(path.join(stage, "catalog.json"), JSON.stringify(target.catalog), { flag: "wx", mode: 0o600 });
    signal.throwIfAborted();
    if (previous.version) await deactivate();
    signal.throwIfAborted();
    await rm(backup, { recursive: true, force: true });
    if (previous.version) {
      await rename(installed, backup);
      moved = true;
    }
    await rename(stage, installed);
    replaced = true;
    signal.throwIfAborted();
    const next: InstalledExtension = { version: target.release.version, enabled: previous.enabled, operation: "idle" };
    await repository.save(next);
    publish(next);
  } catch (error) {
    progress(0);
    try {
      if (replaced) await rm(installed, { recursive: true, force: true });
      if (moved) await rename(backup, installed);
      await rm(stage, { recursive: true, force: true });
      await repository.save(previous);
      publish(previous);
    } catch {
      publish(journal);
      throw Error("UPDATE_ROLLBACK_FAILED");
    }
    if (!signal.aborted) throw error;
    if (signal.reason !== "cancelled") throw Error("DOWNLOAD_FAILED");
    return;
  }
  progress(100);
  // 数据库已提交，即使清理备份失败也不能撤回成功结果；下次启动继续清理。
  await rm(backup, { recursive: true, force: true }).catch(() => undefined);
}
