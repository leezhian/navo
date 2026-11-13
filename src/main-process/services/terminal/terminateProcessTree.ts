import { execFileSync } from "node:child_process";

/** PTY 关闭还需结束前台作业所在的独立进程组，不能只杀登录 Shell。 */
export function terminateDescendants(pid: number) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { timeout: 2000, stdio: "ignore" });
    return;
  }
  const output = execFileSync("/bin/ps", ["-axo", "pid=,ppid="], { encoding: "utf8", timeout: 1500, maxBuffer: 2 * 1024 * 1024 });
  const pairs = output.trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = new Set<number>([pid]);
  let previousSize = 0;
  while (previousSize !== descendants.size) {
    previousSize = descendants.size;
    for (const [child, parent] of pairs) if (descendants.has(parent)) descendants.add(child);
  }
  for (const child of [...descendants].reverse()) {
    if (child === pid || child <= 1 || child === process.pid) continue;
    try { process.kill(child, "SIGKILL"); } catch { /* 已退出的子进程无需再次终止。 */ }
  }
}
