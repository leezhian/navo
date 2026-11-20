import { execFile, execFileSync } from "node:child_process";
import path from "node:path";

/** 启动时间随 PID 一起校验，避免用旧快照向复用该 PID 的新进程发信号。 */
export interface TerminalJob { pid: number; startedAt: string; name: string }
interface TerminalProcesses { rootName?: string; jobs: TerminalJob[] }
const PS_ARGS = ["-axo", "pid=,ppid=,stat=,lstart=,comm="];
const PS_OPTIONS = { encoding: "utf8", timeout: 750, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } } as const;

/** TERM 可能让中间父进程先退出。继续追踪已发现的作业及其后代。 */
function readTerminalProcesses(stdout: string, root: number | undefined, knownJobs: TerminalJob[]): TerminalProcesses {
  const processes = new Map<number, TerminalJob>();
  const children = new Map<number, TerminalJob[]>();
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+\s+\S+\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/.exec(line);
    if (!match || match[3].startsWith("Z")) continue;
    const pid = Number(match[1]), parent = Number(match[2]);
    if (pid <= 1 || pid === process.pid) continue;
    const name = [...path.basename(match[5])]
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join("").replace(/^-/, "").slice(0, 80);
    const job = { pid, startedAt: match[4], name };
    processes.set(pid, job);
    const siblings = children.get(parent) ?? [];
    siblings.push(job);
    children.set(parent, siblings);
  }

  const jobs = root === undefined ? [] : [...(children.get(root) ?? [])];
  for (const job of knownJobs) {
    const current = processes.get(job.pid);
    if (current?.startedAt === job.startedAt) jobs.push(current);
  }
  const found = new Map<number, TerminalJob>();
  for (const job of jobs) {
    if (found.has(job.pid)) continue;
    found.set(job.pid, job);
    jobs.push(...(children.get(job.pid) ?? []));
  }
  return { rootName: root === undefined ? undefined : processes.get(root)?.name, jobs: [...found.values()] };
}

export function terminalProcesses(root: number | undefined, knownJobs: TerminalJob[]): Promise<TerminalProcesses | null> {
  if (process.platform === "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile("/bin/ps", PS_ARGS, PS_OPTIONS, (error, stdout) => {
      resolve(error ? null : readTerminalProcesses(stdout, root, knownJobs));
    });
  });
}

export function terminalProcessesSync(root: number | undefined, knownJobs: TerminalJob[]): TerminalProcesses {
  const stdout = execFileSync("/bin/ps", PS_ARGS, { ...PS_OPTIONS, timeout: 1500 });
  return readTerminalProcesses(stdout, root, knownJobs);
}

export function signalTerminalJobs(jobs: TerminalJob[], signal: "SIGTERM" | "SIGKILL") {
  for (const job of [...jobs].reverse()) {
    try { process.kill(job.pid, signal); } catch { /* 作业可能已退出。 */ }
  }
}
