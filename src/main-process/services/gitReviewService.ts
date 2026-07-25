import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GitFileSnapshot } from "@/domain/diffParser";
import type { CompareMode } from "@/domain/types";
import type {
  GitCommandOutput,
  LoadReviewDiffParams,
  OpenFileInVsCodeParams,
  RunReviewBatchFileActionParams,
  RunReviewFileActionParams,
} from "../../shared/electronApi";
import { readLatestPatch } from "./reviewStorage";

const execFileAsync = promisify(execFile);

interface DiffFilePath {
  oldPath: string | null;
  newPath: string | null;
}

interface DiffContentSource {
  oldTreeish: string;
  newTreeish: string | null;
  readNewFromWorktree: boolean;
}

export async function runGitDiff(params: LoadReviewDiffParams): Promise<GitCommandOutput> {
  if (params.mode === "previous-session") {
    return loadPreviousSessionDiff(params.rawDiffPath);
  }

  const args = createDiffArgs(params.mode, params.targetBranch);
  const output = await runGit(params.projectPath, args);
  const fileSnapshots = await collectDiffFileSnapshots(params.projectPath, params.mode, params.targetBranch, output.stdout);

  return {
    ...output,
    file_snapshots: fileSnapshots,
    signature: hashDiffContent(output.stdout),
  };
}

/**
 * 只计算当前对比方式的 diff 内容签名，不读取文件快照。
 * 供渲染进程在工作区事件后判断是否需要全量 refresh。
 */
export async function getGitDiffSignature(params: LoadReviewDiffParams): Promise<string> {
  if (params.mode === "previous-session") {
    const rawDiff = await readLatestPatch(params.rawDiffPath);
    return hashDiffContent(rawDiff ?? "");
  }

  const args = createDiffArgs(params.mode, params.targetBranch);
  const output = await runGit(params.projectPath, args);
  return hashDiffContent(output.stdout);
}

/**
 * 统计尊重 gitignore 的未跟踪文件数。
 * 主 diff 仍只展示 tracked 改动；该计数仅用于提示条，避免把生成目录灌进审查列表。
 */
export async function getUntrackedFileCount(projectPath: string): Promise<number> {
  try {
    const output = await runGit(projectPath, ["ls-files", "--others", "--exclude-standard"]);
    return output.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
  } catch {
    return 0;
  }
}

function hashDiffContent(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  // 长度参与签名，降低纯哈希碰撞时漏刷新的概率。
  return `${value.length}:${Math.abs(hash).toString(36)}`;
}

async function loadPreviousSessionDiff(rawDiffPath?: string): Promise<GitCommandOutput> {
  const rawDiff = await readLatestPatch(rawDiffPath);

  if (rawDiff == null) {
    throw new Error("缺少上一轮 diff 快照，无法展示该对比模式");
  }

  return {
    stdout: rawDiff,
    stderr: "",
    file_snapshots: [],
    signature: hashDiffContent(rawDiff),
  };
}

export async function loadLocalBranches(projectPath: string): Promise<string[]> {
  const output = await runGit(projectPath, ["branch", "--format=%(refname:short)"]);
  return output.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function openFileInVsCode({ projectPath, filePath }: OpenFileInVsCodeParams): Promise<void> {
  const fullPath = path.join(projectPath, filePath);

  if (await commandSucceeds("code", ["-g", fullPath])) {
    return;
  }

  if (process.platform === "darwin" && (await commandSucceeds("open", ["-a", "Visual Studio Code", fullPath]))) {
    return;
  }

  throw new Error("VS Code command failed");
}

export async function runReviewFileAction({ action, filePath, projectPath }: RunReviewFileActionParams): Promise<void> {
  await runGit(projectPath, createFileActionArgs(action, filePath));
}

export async function runReviewBatchFileAction({
  action,
  filePaths,
  projectPath,
}: RunReviewBatchFileActionParams): Promise<void> {
  if (filePaths.length === 0) {
    return;
  }

  await runGit(projectPath, createBatchFileActionArgs(action, filePaths));
}

function createDiffArgs(mode: CompareMode, targetBranch?: string): string[] {
  const argsByMode: Record<CompareMode, string[]> = {
    unstaged: ["diff"],
    staged: ["diff", "--cached"],
    branch: ["diff", `${targetBranch || "main"}...HEAD`],
    "previous-session": [],
  };

  return [...argsByMode[mode], "--"];
}

function createFileActionArgs(action: RunReviewFileActionParams["action"], filePath: string): string[] {
  const argsByAction: Record<RunReviewFileActionParams["action"], string[]> = {
    "restore-worktree": ["restore", "--worktree", "--", filePath],
    "restore-file": ["restore", "--staged", "--worktree", "--", filePath],
    stage: ["add", "--", filePath],
    unstage: ["restore", "--staged", "--", filePath],
  };

  return argsByAction[action];
}

function createBatchFileActionArgs(action: RunReviewBatchFileActionParams["action"], filePaths: string[]): string[] {
  const argsByAction: Record<RunReviewBatchFileActionParams["action"], string[]> = {
    "restore-worktree-all": ["restore", "--worktree", "--", ...filePaths],
    "stage-all": ["add", "--", ...filePaths],
    "unstage-all": ["restore", "--staged", "--", ...filePaths],
  };

  return argsByAction[action];
}

async function runGit(projectPath: string, args: string[]): Promise<GitCommandOutput> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: projectPath,
      maxBuffer: 1024 * 1024 * 50,
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

async function commandSucceeds(command: string, args: string[]) {
  try {
    await execFileAsync(command, args);
    return true;
  } catch {
    return false;
  }
}

async function collectDiffFileSnapshots(
  projectPath: string,
  mode: CompareMode,
  targetBranch: string | undefined,
  rawDiff: string,
): Promise<GitFileSnapshot[]> {
  const source = await createDiffContentSource(projectPath, mode, targetBranch);
  const files = parseDiffFilePaths(rawDiff);

  return Promise.all(
    files.map(async (file) => ({
      old_path: file.oldPath,
      new_path: file.newPath,
      old_content: file.oldPath ? await readOldContent(projectPath, source, file.oldPath) : null,
      new_content: file.newPath ? await readNewContent(projectPath, source, file.newPath) : null,
    })),
  );
}

async function createDiffContentSource(
  projectPath: string,
  mode: CompareMode,
  targetBranch?: string,
): Promise<DiffContentSource> {
  if (mode === "staged") {
    return {
      oldTreeish: "HEAD",
      newTreeish: ":",
      readNewFromWorktree: false,
    };
  }

  if (mode === "branch") {
    const branch = targetBranch || "main";
    return {
      oldTreeish: (await resolveMergeBase(projectPath, branch)) || branch,
      newTreeish: "HEAD",
      readNewFromWorktree: false,
    };
  }

  return {
    oldTreeish: ":",
    newTreeish: null,
    readNewFromWorktree: true,
  };
}

function readOldContent(projectPath: string, source: DiffContentSource, filePath: string) {
  return readGitObject(projectPath, source.oldTreeish, filePath);
}

function readNewContent(projectPath: string, source: DiffContentSource, filePath: string) {
  if (source.readNewFromWorktree) {
    return readWorktreeFile(projectPath, filePath);
  }

  return source.newTreeish ? readGitObject(projectPath, source.newTreeish, filePath) : Promise.resolve(null);
}

async function resolveMergeBase(projectPath: string, targetBranch: string) {
  try {
    const output = await runGit(projectPath, ["merge-base", targetBranch, "HEAD"]);
    return output.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readGitObject(projectPath: string, treeish: string, filePath: string) {
  const objectPath = treeish === ":" ? `:${filePath}` : `${treeish}:${filePath}`;

  try {
    const output = await runGit(projectPath, ["show", objectPath]);
    return output.stdout;
  } catch {
    return null;
  }
}

async function readWorktreeFile(projectPath: string, filePath: string) {
  try {
    return await readFile(path.join(projectPath, filePath), "utf8");
  } catch {
    return null;
  }
}

function parseDiffFilePaths(rawDiff: string): DiffFilePath[] {
  const files: DiffFilePath[] = [];
  let current: DiffFilePath | null = null;

  for (const line of rawDiff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      pushDiffFilePath(files, current);
      current = parseDiffGitHeader(line);
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("--- ")) {
      current.oldPath = normalizeDiffPath(line.slice(4));
    } else if (line.startsWith("+++ ")) {
      current.newPath = normalizeDiffPath(line.slice(4));
    } else if (line.startsWith("rename from ")) {
      current.oldPath = line.slice("rename from ".length).trim();
    } else if (line.startsWith("rename to ")) {
      current.newPath = line.slice("rename to ".length).trim();
    }
  }

  pushDiffFilePath(files, current);
  return files;
}

function pushDiffFilePath(files: DiffFilePath[], file: DiffFilePath | null) {
  if (file && (file.oldPath || file.newPath)) {
    files.push(file);
  }
}

function parseDiffGitHeader(line: string): DiffFilePath {
  const [, , oldPath, newPath] = line.split(/\s+/);
  return {
    oldPath: normalizeDiffPath(oldPath),
    newPath: normalizeDiffPath(newPath),
  };
}

function normalizeDiffPath(filePath = "") {
  const trimmed = filePath.trim();

  if (!trimmed || trimmed === "/dev/null") {
    return null;
  }

  return trimmed.replace(/^[ab]\//, "");
}

function getCommandErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "").trim();
    if (stderr) {
      return stderr;
    }
  }

  return error instanceof Error ? error.message : fallback;
}
