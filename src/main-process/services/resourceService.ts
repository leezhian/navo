import { diagnosticOperation } from "../diagnostics/diagnosticLogger";
import { access, mkdir, realpath, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { CloneProgress, CloneResourceParams, ResourceRecord, SaveResourceParams } from "../../shared/settingsTypes";
import { readJsonFile, writeJsonFile } from "./jsonFileStorage";
import { redactCloneOutput, resolveResourcePath, validateCloneUrl, validateRepositoryName } from "./resourcePaths";
import { normalizeResourceCommands, normalizeResourceDescription } from "../../utils/resourceConfiguration";
import { mergeDetectedCommands, normalizeCommandDetection } from "../../utils/resourceCommandDetection";
import { detectResourceCommands } from "./commandDetection/detectResourceCommands";
import type { ResourceCommandDetection } from "../../shared/resourceCommandDetection";

interface CloneOperation {
  process: ChildProcess | null;
  cancelled: boolean;
  ownerId: number;
  settled: Promise<void>;
  settle: () => void;
}

export class ResourceService {
  private readonly clones = new Map<string, CloneOperation>();
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storagePath: string) {}

  async list(): Promise<ResourceRecord[]> {
    return diagnosticOperation("resource.list", {}, async () => {
      await this.writeQueue;
      const records = await this.readRecords();
      return Promise.all(records.map(async (record) => ({ ...record, available: await this.isAvailable(record.localPath) })));
    }, { success: false });
  }

  save(params: SaveResourceParams, remoteUrl?: string): Promise<ResourceRecord> {
    return diagnosticOperation(params?.id ? "resource.edit" : "resource.add", { resourceId: params?.id }, async () => {
      return this.serialize(async () => {
        if (!params || (params.kind !== "repo" && params.kind !== "folder") || typeof params.name !== "string" || !params.name.trim() || params.name.length > 100) throw new Error("INVALID_RESOURCE");
        const localPath = await realpath(resolveResourcePath(params.localPath));
        if (!(await stat(localPath)).isDirectory()) throw new Error("INVALID_DIRECTORY");
        await access(localPath, constants.R_OK);
        const records = await this.readRecords();
        const previous = params.id ? records.find((record) => record.id === params.id) : undefined;
        if (params.id && !previous) throw new Error("RESOURCE_NOT_FOUND");
        if (records.some((record) => record.localPath === localPath && record.id !== params.id)) throw new Error("DUPLICATE_RESOURCE");
        const description = normalizeResourceDescription(params.description === undefined ? previous?.description ?? "" : params.description);
        let commands = normalizeResourceCommands(params.commands === undefined ? previous?.commands ?? [] : params.commands);
        let commandDetection = normalizeCommandDetection(params.commandDetection === undefined ? (previous?.localPath === localPath ? previous.commandDetection : undefined) : params.commandDetection);
        if (!previous || previous.localPath !== localPath) {
          // 检测失败不能回滚已克隆或刚添加的目录；结果可在编辑页重试。
          try { commandDetection = await detectResourceCommands(localPath); }
          catch { commandDetection = { commands: [], warnings: [{ source: ".", code: "unreadable" }] }; }
          const merged = mergeDetectedCommands(commands, commandDetection.commands);
          commands = merged.commands;
          if (merged.limited && commandDetection.warnings.length < 50) commandDetection.warnings.push({ source: ".", code: "limitReached" });
        }
        const record: ResourceRecord = { id: previous?.id ?? randomUUID(), kind: params.kind, name: params.name.trim(), localPath, available: true, description, commands, ...(commandDetection ? { commandDetection } : {}) };
        const savedRemote = remoteUrl || (previous?.localPath === localPath ? previous.remoteUrl : undefined);
        if (params.kind === "repo" && savedRemote) record.remoteUrl = savedRemote;
        await writeJsonFile(this.storagePath, previous ? records.map((item) => item.id === record.id ? record : item) : [...records, record]);
        return record;
      });
    });
  }

  remove(id: string) {
    return diagnosticOperation("resource.remove", { resourceId: id }, async () => {
      return this.serialize(async () => {
        const records = await this.readRecords();
        if (!records.some((record) => record.id === id)) throw new Error("RESOURCE_NOT_FOUND");
        await writeJsonFile(this.storagePath, records.filter((record) => record.id !== id));
      });
    });
  }
  /** 只返回检测结果；已有资源是否保存由编辑表单决定。 */
  detectCommands(localPath: string): Promise<ResourceCommandDetection> { return detectResourceCommands(localPath); }

  async clone(params: CloneResourceParams, ownerId: number, onProgress: (progress: CloneProgress) => void): Promise<ResourceRecord> {
    return diagnosticOperation("resource.clone", {}, async () => {
      const url = validateCloneUrl(params.url);
      const name = validateRepositoryName(params.name);
      if (!/^[\w-]{1,100}$/.test(params.operationId) || this.clones.has(params.operationId)) throw new Error("INVALID_OPERATION");
      const directory = resolveResourcePath(params.directory);
      const target = path.join(directory, name);
      // 在文件系统操作之前登记，避免用户立即取消时请求丢失。
      let settle: () => void = () => undefined;
      const settled = new Promise<void>((resolve) => { settle = resolve; });
      const operation: CloneOperation = { process: null, cancelled: false, ownerId, settled, settle };
      this.clones.set(params.operationId, operation);
      let ownsTarget = false;
      const checkCancelled = () => { if (operation.cancelled) throw new Error("CLONE_CANCELLED"); };
      try {
        await mkdir(directory, { recursive: true });
        checkCancelled();
        await access(directory, constants.R_OK | constants.W_OK);
        checkCancelled();
        try { await mkdir(target); ownsTarget = true; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("DIRECTORY_EXISTS");
          throw error;
        }
        checkCancelled();
        const child = spawn("git", ["clone", "--progress", "--", url, target], {
          cwd: directory, detached: process.platform !== "win32",
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        operation.process = child;
        child.stdout?.resume();
        let recentOutput = "";
        child.stderr?.on("data", (chunk: Buffer) => {
          recentOutput = (recentOutput + chunk.toString()).slice(-8000);
          onProgress({ operationId: params.operationId, message: redactCloneOutput(recentOutput).slice(-4000) });
        });
        await new Promise<void>((resolve, reject) => {
          child.once("error", () => reject(new Error("GIT_UNAVAILABLE")));
          child.once("close", (code) => {
            if (operation.cancelled) reject(new Error("CLONE_CANCELLED"));
            else if (code === 0) resolve();
            else reject(new Error("CLONE_FAILED"));
          });
        });
      } catch (error) {
        // 只清理本次独占创建的目录，永远不删除用户已有目录。
        if (ownsTarget) await rm(target, { recursive: true, force: true });
        throw error;
      } finally {
        this.clones.delete(params.operationId);
        operation.settle();
      }
      try { return await this.save({ kind: "repo", name, localPath: target }, url); }
      catch { throw new Error("CLONE_RECORD_FAILED"); }
    }, { started: true });
  }

  cancel(operationId: string, ownerId: number) {
    const operation = this.clones.get(operationId);
    if (!operation || operation.ownerId !== ownerId) return;
    operation.cancelled = true;
    const child = operation.process;
    if (!child) return;
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
      else child.kill();
    } catch { child.kill(); }
    const timeout = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* 子进程可能已退出。 */ }
    }, 3000);
    timeout.unref();
    child.once("close", () => clearTimeout(timeout));
  }

  async cancelAll(ownerId?: number) {
    const pending: Promise<void>[] = [];
    for (const [id, operation] of this.clones) {
      if (ownerId === undefined || operation.ownerId === ownerId) {
        pending.push(operation.settled);
        this.cancel(id, operation.ownerId);
      }
    }
    await Promise.all(pending);
    await this.writeQueue;
  }

  private serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  private async readRecords(): Promise<ResourceRecord[]> {
    let value;
    try { value = await readJsonFile(this.storagePath); }
    catch (error) { if (error instanceof SyntaxError) throw new Error("INVALID_RESOURCE_STORAGE"); throw error; }
    if (value === null) return [];
    if (!Array.isArray(value) || value.some((record) => !record || typeof record.id !== "string" || !record.id || typeof record.name !== "string" || typeof record.localPath !== "string" || !path.isAbsolute(record.localPath) || (record.remoteUrl !== undefined && typeof record.remoteUrl !== "string") || (record.kind !== "repo" && record.kind !== "folder"))) throw new Error("INVALID_RESOURCE_STORAGE");
    if (new Set(value.map((record) => record.id)).size !== value.length) throw new Error("INVALID_RESOURCE_STORAGE");
    try {
      return value.map((record) => ({ ...record, description: normalizeResourceDescription(record.description === undefined ? "" : record.description), commands: normalizeResourceCommands(record.commands === undefined ? [] : record.commands), ...(record.commandDetection !== undefined ? { commandDetection: normalizeCommandDetection(record.commandDetection) } : {}) }));
    } catch { throw new Error("INVALID_RESOURCE_STORAGE"); }
  }

  private async isAvailable(localPath: string) {
    try {
      await access(localPath, constants.R_OK);
      return (await stat(localPath)).isDirectory();
    } catch { return false; }
  }
}
