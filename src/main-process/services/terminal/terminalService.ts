import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WebContents } from "electron";
import { spawn, type IPty } from "node-pty";
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

interface TerminalRecord {
  /** 创建该会话的渲染进程，避免不同窗口互相读写 PTY。 */
  owner: WebContents;
  pty: IPty;
  pendingOutput: string;
  flushTimer: NodeJS.Timeout | null;
  isDisposed: boolean;
}

const terminalRecords = new Map<string, TerminalRecord>();
const terminalOwnerCleanupBound = new Set<number>();

export function createTerminal(params: CreateTerminalParams, owner: WebContents): void {
  validateSessionId(params.sessionId);
  const existing = terminalRecords.get(params.sessionId);
  if (existing && existing.owner.id !== owner.id) {
    throw new Error("终端会话 id 已被其他窗口占用");
  }
  destroyTerminal({ sessionId: params.sessionId }, owner.id);

  const shell = resolveShell();
  const pty = spawn(shell, resolveShellArgs(shell), {
    name: "xterm-256color",
    cols: normalizeDimension(params.cols),
    rows: normalizeDimension(params.rows),
    cwd: resolveWorkingDirectory(params.cwd),
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "vibe-reviewer",
    },
  });

  const record: TerminalRecord = {
    owner,
    pty,
    pendingOutput: "",
    flushTimer: null,
    isDisposed: false,
  };
  terminalRecords.set(params.sessionId, record);
  bindOwnerCleanup(owner);

  pty.onData((data) => {
    if (record.isDisposed) {
      return;
    }

    record.pendingOutput += data;
    if (record.pendingOutput.length >= MAX_PENDING_OUTPUT_LENGTH) {
      flushTerminalOutput(params.sessionId, record);
      return;
    }

    scheduleOutputFlush(params.sessionId, record);
  });

  pty.onExit(({ exitCode, signal }) => {
    flushTerminalOutput(params.sessionId, record);
    terminalRecords.delete(params.sessionId);
    record.isDisposed = true;
    if (!owner.isDestroyed()) {
      owner.send(ipcChannels.terminalExit, { sessionId: params.sessionId, exitCode, signal });
    }
  });

}

export function writeTerminal(params: WriteTerminalParams, ownerId: number): void {
  const record = getOwnedRecord(params.sessionId, ownerId);
  record.pty.write(params.data);
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
  record.isDisposed = true;
  if (record.flushTimer) {
    clearTimeout(record.flushTimer);
    record.flushTimer = null;
  }

  try {
    record.pty.kill();
  } catch {
    // Shell 已经退出时 kill 可能抛错，资源记录已清理，不再向上层传播。
  }
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

function resolveShell(): string {
  if (process.platform === "win32") {
    return process.env.SHELL || process.env.ComSpec || "powershell.exe";
  }

  const shell = process.env.SHELL;
  if (shell && existsSync(shell)) {
    return shell;
  }

  return process.platform === "darwin" ? "/bin/zsh" : "/bin/sh";
}

function resolveShellArgs(shell: string): string[] {
  if (process.platform === "win32") {
    return [];
  }

  const shellName = path.basename(shell);
  return ["bash", "fish", "ksh", "sh", "zsh"].includes(shellName) ? ["-l"] : [];
}

function resolveWorkingDirectory(candidate?: string): string {
  if (candidate && existsSync(candidate)) {
    try {
      if (statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // 目录在检查期间消失时回退到用户主目录。
    }
  }

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
