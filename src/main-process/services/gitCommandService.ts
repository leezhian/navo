import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitCommandOutput } from "../../shared/electronApi";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 1024 * 1024 * 50;

/**
 * 执行 Git 命令并统一转换输出格式，避免各个业务服务重复处理错误和 diff 签名。
 */
export async function runGit(projectPath: string, args: string[]): Promise<GitCommandOutput> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: projectPath,
      maxBuffer: GIT_MAX_BUFFER,
    });

    return {
      stdout,
      stderr,
      file_snapshots: [],
      signature: hashDiffContent(stdout),
    };
  } catch (error) {
    throw new Error(getCommandErrorMessage(error, "Git command failed"));
  }
}

/**
 * 运行外部命令并只返回成功与否，适用于 VS Code 命令行等可选系统能力探测。
 */
export async function commandSucceeds(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * 用轻量签名判断 diff 内容是否发生变化，避免监听期间每次都传输完整 diff。
 */
export function hashDiffContent(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  // 长度参与签名，降低纯哈希碰撞时漏刷新的概率。
  return `${value.length}:${Math.abs(hash).toString(36)}`;
}

function getCommandErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "").trim();
    if (stderr) {
      return stderr;
    }
  }

  return error instanceof Error ? error.message : fallback;
}
