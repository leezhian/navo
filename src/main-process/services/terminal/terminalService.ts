import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WebContents } from "electron";
import { spawn, type IPty } from "node-pty";
import { setTimeout as delay } from "node:timers/promises";
import { signalTerminalJobs, terminalProcesses, type TerminalJob } from "./terminalProcesses";
import { terminateDescendants } from "./terminateProcessTree";
import { ipcChannels } from "../../../shared/ipcChannels";
import type {
  CreateTerminalParams,
  ResizeTerminalParams,
  TerminalSessionParams,
  WriteTerminalParams,
} from "../../../shared/terminalTypes";

const OUTPUT_BATCH_DELAY_MS = 16;
const MAX_PENDING_OUTPUT_LENGTH = 32 * 1024;
const MIN_TERMINAL_DIMENSION = 1;
const MAX_TERMINAL_DIMENSION = 500;
const TERMINAL_CLOSE_POLL_MS = 100;
const TERMINAL_JOB_EXIT_POLLS = 8;
const TERMINAL_PTY_EXIT_POLLS = 5;

interface TerminalRecord {
  replay: string;
  onFinish?: () => void;
  onActivity?: () => void;
  /** 创建该会话的渲染进程，避免不同窗口互相读写 PTY。 */
  owner: WebContents;
  pty: IPty;
  /** 启动时的可执行文件，用于识别原 Shell 已经被 exec 替换。 */
  executable: string;
  pendingOutput: string;
  flushTimer: NodeJS.Timeout | null;
  isDisposed: boolean;
  exit?: { exitCode: number; signal?: number };
  /** 正常关闭期间收集的进程，父进程退出后仍可由强制关闭清理。 */
  closingJobs: TerminalJob[];
}

const terminalRecords = new Map<string, TerminalRecord>();
const terminalOwnerCleanupBound = new Set<number>();

export interface TerminalLaunch {
  /** 短命令可能在界面附着前结束，保留有界输出直到用户关闭终端。 */
  retainOnExit?: boolean;
  /** 任务绑定目录缺失时禁止回退到用户主目录。 */
  strictCwd?: boolean;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** 完成或关闭时释放设置操作的互斥状态，不持久化终端输出。 */
  onFinish: () => void;
  /** 任务会话状态来自实际进程退出，不从终端文本猜测。 */
  onExit?: (exitCode: number) => void;
  /** 只通知真实输入输出，不传递内容；附着、回放和尺寸调整不算活动。 */
  onActivity?: () => void;
}

export function createTerminal(params: CreateTerminalParams, owner: WebContents, launch?: TerminalLaunch): void {
  validateSessionId(params.sessionId);
  const existing = terminalRecords.get(params.sessionId);
  if (existing && existing.owner.id !== owner.id) {
    throw new Error("终端会话 id 已被其他窗口占用");
  }
  destroyTerminal({ sessionId: params.sessionId }, owner.id);

  const shell = resolveShell();
  const executable = launch?.command ?? shell;
  const pty = spawn(executable, launch?.args ?? resolveShellArgs(shell), {
    name: "xterm-256color",
    cols: normalizeDimension(params.cols),
    rows: normalizeDimension(params.rows),
    cwd: resolveWorkingDirectory(params.cwd, launch?.strictCwd),
    env: {
      ...(launch?.env ?? process.env),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "Navo",
    },
  });

  const record: TerminalRecord = {
    replay: "",
    onFinish: launch?.onFinish,
    onActivity: launch?.onActivity,
    owner,
    pty,
    executable: path.basename(executable),
    pendingOutput: "",
    flushTimer: null,
    isDisposed: false,
    closingJobs: [],
  };
  terminalRecords.set(params.sessionId, record);
  bindOwnerCleanup(owner);

  pty.onData((data) => {
    if (record.isDisposed) {
      return;
    }

    if (data.length) record.onActivity?.();
    record.replay = (record.replay + data).slice(-256 * 1024);
    record.pendingOutput += data;
    if (record.pendingOutput.length >= MAX_PENDING_OUTPUT_LENGTH) {
      flushTerminalOutput(params.sessionId, record);
      return;
    }

    scheduleOutputFlush(params.sessionId, record);
  });

  pty.onExit(({ exitCode, signal }) => {
    if (record.isDisposed) return;
    flushTerminalOutput(params.sessionId, record);
    if (launch?.retainOnExit) record.exit = { exitCode, signal };
    else terminalRecords.delete(params.sessionId);
    record.isDisposed = true;
    record.onFinish?.();
    launch?.onExit?.(exitCode);
    if (!owner.isDestroyed()) {
      owner.send(ipcChannels.terminalExit, { sessionId: params.sessionId, exitCode, signal });
    }
  });

}

export function writeTerminal(params: WriteTerminalParams, ownerId: number): void {
  const record = getOwnedRecord(params.sessionId, ownerId);
  record.pty.write(params.data);
  if (params.data.length) record.onActivity?.();
}

export function resizeTerminal(params: ResizeTerminalParams, ownerId: number): void {
  const record = getOwnedRecord(params.sessionId, ownerId);
  record.pty.resize(normalizeDimension(params.cols), normalizeDimension(params.rows));
}

export function destroyTerminal(params: TerminalSessionParams, ownerId?: number): void {
  const record = terminalRecords.get(params.sessionId);
  if (!record || (ownerId !== undefined && record.owner.id !== ownerId)) {
    return;
  }

  terminalRecords.delete(params.sessionId);
  if (!record.exit || record.closingJobs.length) {
    try { terminateDescendants(record.exit ? undefined : record.pty.pid, record.closingJobs); }
    catch { /* 进程查询失败仍要关闭 PTY 本身。 */ }
  }
  if (record.exit) return;
  record.isDisposed = true;
  record.onFinish?.();
  if (record.flushTimer) {
    clearTimeout(record.flushTimer);
    record.flushTimer = null;
  }

  try {
    record.pty.kill("SIGKILL");
  } catch {
    // Shell 已经退出时 kill 可能抛错，资源记录已清理，不再向上层传播。
  }
  if (!record.owner.isDestroyed()) record.owner.send(ipcChannels.terminalExit, { sessionId: params.sessionId, exitCode: 0, signal: 9 });
}

/** 普通 Shell 空闲时直接关闭。有运行程序时先确认，随后尝试正常终止。 */
export async function requestTerminalClose(params: TerminalSessionParams, ownerId: number, mode: "inspect" | "confirm" | "force", command?: string) {
  const record = terminalRecords.get(params.sessionId);
  if (!record) return { kind: "closed" as const };
  if (record.owner.id !== ownerId) throw new Error("SESSION_UNAVAILABLE");
  function finish() {
    if (terminalRecords.get(params.sessionId) === record) destroyTerminal(params, ownerId);
    return { kind: "closed" as const };
  }
  if (mode === "force" || (record.isDisposed && !record.closingJobs.length)) return finish();
  const inspectProcesses = () => terminalProcesses(record.isDisposed ? undefined : record.pty.pid, record.closingJobs);
  const processes = await inspectProcesses();
  if (terminalRecords.get(params.sessionId) !== record) return finish();
  const rootProgram = processes?.rootName && processes.rootName !== record.executable ? processes.rootName : undefined;
  const program = (record.isDisposed ? undefined : command ?? rootProgram) ?? processes?.jobs[0]?.name;
  if (mode === "inspect") {
    if (program || !processes || processes.jobs.length) return { kind: "confirm" as const, program };
    return finish();
  }
  if (!processes) return { kind: "needsForce" as const, program };
  record.closingJobs = processes.jobs;
  signalTerminalJobs(record.closingJobs, "SIGTERM");
  for (let attempt = 0; attempt < TERMINAL_JOB_EXIT_POLLS && record.closingJobs.length; attempt++) {
    await delay(TERMINAL_CLOSE_POLL_MS);
    const remaining = await inspectProcesses();
    if (terminalRecords.get(params.sessionId) !== record) return finish();
    if (!remaining) return { kind: "needsForce" as const, program };
    record.closingJobs = remaining.jobs;
  }
  if (record.closingJobs.length) return { kind: "needsForce" as const, program };
  // 交互 Shell 可能忽略 SIGTERM，挂断信号等同于终端连接正常关闭。
  if (!record.isDisposed) record.pty.kill("SIGHUP");
  for (let attempt = 0; attempt < TERMINAL_PTY_EXIT_POLLS && !record.isDisposed; attempt++) await delay(TERMINAL_CLOSE_POLL_MS);
  if (!record.isDisposed) return { kind: "needsForce" as const, program };
  return finish();
}

export function destroyAllTerminals(): void {
  for (const [sessionId, record] of terminalRecords) {
    destroyTerminal({ sessionId }, record.owner.id);
  }
}

function bindOwnerCleanup(owner: WebContents): void {
  if (terminalOwnerCleanupBound.has(owner.id)) {
    return;
  }

  terminalOwnerCleanupBound.add(owner.id);
  // 每个窗口只绑定一次，避免创建多个 Tab 后堆积 destroyed 监听器。
  owner.once("destroyed", () => {
    terminalOwnerCleanupBound.delete(owner.id);
    for (const [sessionId, record] of terminalRecords) {
      if (record.owner.id === owner.id) {
        destroyTerminal({ sessionId }, owner.id);
      }
    }
  });
}

function scheduleOutputFlush(sessionId: string, record: TerminalRecord): void {
  if (record.flushTimer || record.isDisposed) {
    return;
  }

  record.flushTimer = setTimeout(() => {
    record.flushTimer = null;
    flushTerminalOutput(sessionId, record);
  }, OUTPUT_BATCH_DELAY_MS);
}

function flushTerminalOutput(sessionId: string, record: TerminalRecord): void {
  if (record.flushTimer) {
    clearTimeout(record.flushTimer);
    record.flushTimer = null;
  }

  if (!record.pendingOutput || record.isDisposed) {
    return;
  }

  const data = record.pendingOutput;
  record.pendingOutput = "";
  if (!record.owner.isDestroyed()) {
    record.owner.send(ipcChannels.terminalData, { sessionId, data });
  }
}

function getOwnedRecord(sessionId: string, ownerId: number): TerminalRecord {
  const record = terminalRecords.get(sessionId);
  if (!record || record.owner.id !== ownerId || record.isDisposed) {
    throw new Error("终端会话不存在或已关闭");
  }

  return record;
}

export function resolveShell(): string {
  if (process.platform === "win32") {
    return process.env.SHELL || process.env.ComSpec || "powershell.exe";
  }

  const shell = process.env.SHELL;
  if (shell && existsSync(shell)) {
    return shell;
  }

  return process.platform === "darwin" ? "/bin/zsh" : "/bin/sh";
}

/** 渲染器重新挂载/刷新只附着已启动的会话，不重新启动 Agent。 */
export function attachTerminal(params: CreateTerminalParams, ownerId: number) {
  const record = terminalRecords.get(params.sessionId);
  if (!record || record.owner.id !== ownerId || (record.isDisposed && !record.exit)) throw new Error("SESSION_UNAVAILABLE");
  if (record.flushTimer) clearTimeout(record.flushTimer);
  record.flushTimer = null;
  record.pendingOutput = "";
  record.owner.send(ipcChannels.terminalData, { sessionId: params.sessionId, data: record.replay, replay: true });
  if (record.exit) record.owner.send(ipcChannels.terminalExit, { sessionId: params.sessionId, ...record.exit });
  else resizeTerminal(params, ownerId);
}

function resolveShellArgs(shell: string): string[] {
  if (process.platform === "win32") {
    return [];
  }

  const shellName = path.basename(shell);
  return ["bash", "fish", "ksh", "sh", "zsh"].includes(shellName) ? ["-l"] : [];
}

function resolveWorkingDirectory(candidate?: string, strict = false): string {
  if (candidate && existsSync(candidate)) {
    try {
      if (statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // 目录在检查期间消失时回退到用户主目录。
    }
  }

  if (strict) throw new Error("SESSION_DIRECTORY_MISSING");
  return os.homedir();
}

function normalizeDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 80;
  }

  return Math.min(MAX_TERMINAL_DIMENSION, Math.max(MIN_TERMINAL_DIMENSION, Math.floor(value)));
}

function validateSessionId(sessionId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
    throw new Error("无效的终端会话 id");
  }
}
