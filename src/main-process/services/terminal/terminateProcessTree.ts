import { execFileSync } from "node:child_process";
import { signalTerminalJobs, terminalProcessesSync, type TerminalJob } from "./terminalProcesses";

/** PTY 关闭还需结束前台作业所在的独立进程组，不能只杀登录 Shell。 */
export function terminateDescendants(pid: number | undefined, knownJobs: TerminalJob[]) {
  if (process.platform === "win32") {
    if (pid !== undefined) execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { timeout: 2000, stdio: "ignore" });
    return;
  }
  signalTerminalJobs(terminalProcessesSync(pid, knownJobs).jobs, "SIGKILL");
}
