import { normalizeExtensionErrorCode } from "../../../shared/extensionErrors";
import type { ExtensionErrorCode } from "../../../shared/extensionErrors";
import { mkdir, rm, lstat } from "node:fs/promises";
import path from "node:path";
import type { ExtensionStatus } from "../../../shared/extensionTypes";
import type { ExtensionRepository, InstalledExtension } from "./extensionRepository";
import { ExtensionUpdates } from "./extensionUpdates";
import { compareVersions, installedRelease } from "./extensionCatalog";
import { recoverInstallation, replaceInstallation } from "./extensionInstallation";
import trust from "./sessionTraceTrust.json";
import { verifyInstallation } from "./extensionPackage";
import type { ExtensionRelease } from "./extensionPackage";

const INITIAL_UPDATE_CHECK_DELAY = 30_000;
const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

export function extensionError(error: unknown) {
  return normalizeExtensionErrorCode(error instanceof Error ? error.message : undefined);
}

export class ExtensionService {
  private record: InstalledExtension = { version: null, enabled: false, operation: "idle" };
  private progress = 0;
  private error: ExtensionErrorCode | null = null;
  private compatible = true;
  private abort: AbortController | null = null;
  private busy = false;
  private pending: Promise<void> | null = null;
  private updates: ExtensionUpdates;
  private initialCheck?: ReturnType<typeof setTimeout>;
  private checkTimer?: ReturnType<typeof setInterval>;
  constructor(
    readonly directory: string,
    private repository: ExtensionRepository,
    readonly release: ExtensionRelease,
    private changed: (status: ExtensionStatus) => void,
    private deactivate: () => void | Promise<void>,
    private hostMajor = 1,
    private updateSource = trust,
  ) {
    this.updates = new ExtensionUpdates(directory, release, hostMajor, () => this.emit(), updateSource);
  }
  get installedDirectory() {
    return path.join(this.directory, "installed");
  }
  get status(): ExtensionStatus {
    return {
      id: "session-trace",
      version: this.record.version,
      availableVersion: this.updates.candidate.release.version,
      downloadBytes: this.updates.candidate.release.bytes,
      updateAvailable: Boolean(this.record.version && compareVersions(this.updates.candidate.release.version, this.record.version) > 0),
      checking: this.updates.checking,
      checkedAt: this.updates.checkedAt,
      updateError: this.updates.error,
      enabled: this.record.enabled && this.record.operation === "idle",
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
    this.record = await recoverInstallation(this.directory, this.repository, this.record);
    await this.updates.initialize();
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
    if (!this.record.version) throw Error("INCOMPATIBLE");
    const release = await installedRelease(
      this.installedDirectory,
      this.record.version,
      this.release,
      this.hostMajor,
      this.updateSource.publicKey,
    );
    await verifyInstallation(this.installedDirectory, release);
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
  /** 检查只更新版本元数据，不中断正在运行的插件，不执行安装。 */
  checkForUpdates() {
    if (this.busy) return Promise.reject(Error("BUSY"));
    return this.updates.check();
  }
  startUpdateChecks() {
    if (this.checkTimer) return;
    const check = () => {
      if (this.record.version && !this.busy) void this.checkForUpdates().catch(() => undefined);
    };
    this.initialCheck = setTimeout(check, INITIAL_UPDATE_CHECK_DELAY);
    this.checkTimer = setInterval(check, UPDATE_CHECK_INTERVAL);
    this.initialCheck.unref();
    this.checkTimer.unref();
  }
  install(filename?: string) {
    return this.replace(false, filename);
  }
  update() {
    return this.replace(true);
  }
  private replace(updating: boolean, filename?: string) {
    return this.operation(async () => {
      if (this.record.operation !== "idle" || this.updates.checking || (updating ? !this.status.updateAvailable : this.record.version))
        throw Error("BUSY");
      const target = this.updates.candidate;
      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.progress = 0;
      const timeout = setTimeout(() => this.abort?.abort("timeout"), 120000);
      try {
        await replaceInstallation({
          directory: this.directory,
          repository: this.repository,
          previous: this.record,
          target,
          filename,
          signal,
          progress: (value) => {
            this.progress = value;
            this.emit();
          },
          publish: (record) => {
            this.record = record;
            this.emit();
          },
          deactivate: this.deactivate,
        });
        if (this.record.version === target.release.version) this.compatible = true;
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
      for (const name of ["installed", "staging", "backup", "cache"])
        await rm(path.join(this.directory, name), { recursive: true, force: true });
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
    clearTimeout(this.initialCheck);
    clearInterval(this.checkTimer);
    this.cancel();
    await this.updates.shutdown();
    await this.deactivate();
    await this.pending?.catch(() => undefined);
  }
}
