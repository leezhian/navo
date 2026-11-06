import { mkdir, readFile, rename, rm, lstat } from "node:fs/promises";
import path from "node:path";
import type { ExtensionStatus } from "../../../shared/extensionTypes";
import type { ExtensionRepository, InstalledExtension } from "./extensionRepository";
import { downloadExtension } from "./extensionDownload";
import { MAX_PACKAGE_BYTES, unpackPackage, verifyInstallation } from "./extensionPackage";
import type { ExtensionRelease } from "./extensionPackage";

const failureCodes = new Set(["PACKAGE_INVALID", "INCOMPATIBLE", "RELEASE_UNAVAILABLE", "DOWNLOAD_FAILED", "BUSY"]);
export function extensionError(error: unknown) {
  return error instanceof Error && failureCodes.has(error.message) ? error.message : "OPERATION_FAILED";
}

export class ExtensionService {
  private record: InstalledExtension = { version: null, enabled: false, operation: "idle" };
  private progress = 0;
  private error: string | null = null;
  private compatible = true;
  private abort: AbortController | null = null;
  private busy = false;
  private pending: Promise<void> | null = null;
  constructor(
    readonly directory: string,
    private repository: ExtensionRepository,
    readonly release: ExtensionRelease,
    private changed: (status: ExtensionStatus) => void,
    private deactivate: () => void | Promise<void>,
    private hostMajor = 1,
  ) {}
  get installedDirectory() {
    return path.join(this.directory, "installed");
  }
  get status(): ExtensionStatus {
    return {
      id: "session-trace",
      version: this.record.version,
      availableVersion: this.release.version,
      downloadBytes: this.release.bytes,
      enabled: this.record.enabled,
      compatible: this.compatible,
      operation: this.record.operation,
      progress: this.progress,
      error: this.error,
    };
  }
  private emit() {
    this.changed(this.status);
  }
  async initialize() {
    this.record = await this.repository.load();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(this.directory)).isSymbolicLink()) throw Error("PACKAGE_INVALID");
    if (this.record.operation === "installing") {
      await rm(path.join(this.directory, "staging"), { recursive: true, force: true });
      if (!this.record.version) await rm(this.installedDirectory, { recursive: true, force: true });
      this.record = { ...this.record, operation: "idle", enabled: false };
      await this.repository.save(this.record);
    }
    if (this.record.operation === "uninstalling") {
      this.record.enabled = false;
      this.error = "CLEANUP_REQUIRED";
    }
    if (this.record.version && this.record.operation === "idle") {
      try {
        await this.verify();
      } catch (error) {
        this.record.enabled = false;
        this.error = extensionError(error);
        this.compatible = false;
      }
    }
    this.emit();
  }
  private async verify() {
    if (this.record.version !== this.release.version || this.hostMajor !== 1) throw Error("INCOMPATIBLE");
    await verifyInstallation(this.installedDirectory, this.release);
  }
  private operation(run: () => Promise<void>) {
    if (this.busy) return Promise.reject(Error("BUSY"));
    this.busy = true;
    this.error = null;
    const pending = run()
      .catch((error) => {
        this.error = extensionError(error);
        throw Error(this.error);
      })
      .finally(() => {
        this.busy = false;
        this.pending = null;
        this.emit();
      });
    this.pending = pending;
    return pending;
  }
  install(filename?: string) {
    return this.operation(async () => {
      if (this.record.version || this.record.operation !== "idle") throw Error("BUSY");
      this.abort = new AbortController();
      const signal = this.abort.signal;
      const stage = path.join(this.directory, "staging");
      this.record = { version: null, enabled: false, operation: "installing" };
      this.progress = 0;
      await this.repository.save(this.record);
      this.emit();
      const timeout = setTimeout(() => this.abort?.abort("timeout"), 120000);
      try {
        if (filename && (!(await lstat(filename)).isFile() || (await lstat(filename)).size > MAX_PACKAGE_BYTES))
          throw Error("PACKAGE_INVALID");
        const bytes = filename
          ? await readFile(filename)
          : await downloadExtension(this.release, signal, (value) => {
              this.progress = value;
              this.emit();
            });
        signal.throwIfAborted();
        await rm(stage, { recursive: true, force: true });
        await unpackPackage(bytes, this.release, stage);
        signal.throwIfAborted();
        await rename(stage, this.installedDirectory);
        this.record = { version: this.release.version, enabled: false, operation: "idle" };
        await this.repository.save(this.record);
        this.progress = 100;
        this.compatible = true;
      } catch (error) {
        // 安装尚未提交时仅清理本功能自己的目录，不接触 Agent 历史。
        this.record = { version: null, enabled: false, operation: "installing" };
        await rm(stage, { recursive: true, force: true });
        await rm(this.installedDirectory, { recursive: true, force: true });
        this.record.operation = "idle";
        await this.repository.save(this.record);
        if (!signal.aborted) throw error;
        if (signal.reason !== "cancelled") throw Error("DOWNLOAD_FAILED");
      } finally {
        clearTimeout(timeout);
        this.abort = null;
      }
    });
  }
  cancel() {
    this.abort?.abort("cancelled");
  }
  setEnabled(enabled: boolean) {
    return this.operation(async () => {
      if (typeof enabled !== "boolean" || !this.record.version || this.record.operation !== "idle") throw Error("BUSY");
      if (enabled) await this.verify();
      else {
        this.record.enabled = false;
        this.emit();
        await this.deactivate();
      }
      const next = { ...this.record, enabled };
      await this.repository.save(next);
      this.record = next;
    });
  }
  uninstall() {
    return this.operation(async () => {
      this.record = { ...this.record, enabled: false, operation: "uninstalling" };
      this.emit();
      await this.repository.save(this.record);
      await this.deactivate();
      for (const name of ["installed", "staging", "cache"]) await rm(path.join(this.directory, name), { recursive: true, force: true });
      const empty: InstalledExtension = { version: null, enabled: false, operation: "idle" };
      await this.repository.save(empty);
      this.record = empty;
      this.progress = 0;
      this.compatible = true;
    });
  }
  reportRuntimeFailure() {
    this.error = "RUNTIME_FAILED";
    this.emit();
  }
  async shutdown() {
    this.cancel();
    await this.deactivate();
    await this.pending?.catch(() => undefined);
  }
}
