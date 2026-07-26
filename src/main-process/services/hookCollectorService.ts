import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ReviewProvider } from "@/domain/types";
import {
  deletePendingBaseline,
  readPendingBaseline,
  readReviewEvents,
  saveReviewEvent,
  writeLatestPatch,
  writePendingBaseline,
  type ReviewStorageOptions,
} from "./reviewStorage";
import { extractFirstUserPromptFromTranscript, normalizePromptTitle } from "./sessionTitleService";

const execFileAsync = promisify(execFile);
const EMPTY_HOOK_OUTPUT = "";
const SUPPORTED_START_EVENTS = new Set(["UserPromptSubmit"]);
const SUPPORTED_END_EVENTS = new Set(["Stop", "SessionEnd"]);

export interface HookCollectorOptions extends ReviewStorageOptions {
  provider: ReviewProvider;
}

interface NormalizedHookInput {
  eventName: string;
  sessionId: string;
  turnId?: string;
  transcriptPath?: string;
  /** UserPromptSubmit 载荷中的用户 prompt 原文，用于生成会话标题。 */
  prompt?: string;
  cwd: string;
}

interface GitSnapshot {
  branchName: string;
  projectName: string;
  projectPath: string;
  tree: string;
}

interface DiffStats {
  additions: number;
  deletions: number;
  fileCount: number;
}

export async function runHookCollectorFromStdin(options: HookCollectorOptions) {
  const rawInput = await readStdin();
  await collectHookEvent(rawInput, options);
  return EMPTY_HOOK_OUTPUT;
}

export async function collectHookEvent(rawInput: string, options: HookCollectorOptions) {
  const input = normalizeHookInput(rawInput);

  if (!input) {
    return;
  }

  if (SUPPORTED_START_EVENTS.has(input.eventName)) {
    await collectStartEvent(input, options);
    return;
  }

  if (SUPPORTED_END_EVENTS.has(input.eventName)) {
    await collectEndEvent(input, options);
  }
}

function normalizeHookInput(rawInput: string): NormalizedHookInput | null {
  const value = parseHookJson(rawInput);
  if (!isRecord(value)) {
    return null;
  }

  const eventName = getString(value, "hook_event_name") ?? getString(value, "hookEventName") ?? getString(value, "event");
  const sessionId = getString(value, "session_id") ?? getString(value, "sessionId");
  const cwd = getString(value, "cwd") ?? getString(value, "project_dir") ?? getString(value, "projectDir");

  if (!eventName || !sessionId || !cwd) {
    return null;
  }

  return {
    eventName,
    sessionId,
    cwd,
    transcriptPath: getString(value, "transcript_path") ?? getString(value, "transcriptPath"),
    turnId: getString(value, "turn_id") ?? getString(value, "turnId"),
    prompt: getString(value, "prompt"),
  };
}

async function collectStartEvent(input: NormalizedHookInput, options: HookCollectorOptions) {
  const snapshot = await createGitSnapshot(input.cwd);
  if (!snapshot) {
    return;
  }

  const now = new Date().toISOString();
  await writePendingBaseline(
    {
      provider: options.provider,
      sessionId: input.sessionId,
      turnId: input.turnId,
      transcriptPath: input.transcriptPath,
      promptTitle: normalizePromptTitle(input.prompt),
      projectPath: snapshot.projectPath,
      projectName: snapshot.projectName,
      branchName: snapshot.branchName,
      baselineTree: snapshot.tree,
      startedAt: now,
      updatedAt: now,
    },
    options,
  );
}

async function collectEndEvent(input: NormalizedHookInput, options: HookCollectorOptions) {
  const pending = await readPendingBaseline(options.provider, input.sessionId, options);
  if (!pending) {
    return;
  }

  const snapshot = await createGitSnapshot(input.cwd);
  if (!snapshot) {
    return;
  }

  const rawDiff = await diffTrees(snapshot.projectPath, pending.baselineTree, snapshot.tree);
  if (!rawDiff.trim()) {
    return;
  }

  const rawDiffPath = await writeLatestPatch(options.provider, input.sessionId, rawDiff, options);
  const stats = collectDiffStats(rawDiff);
  const now = new Date().toISOString();
  const transcriptPath = input.transcriptPath ?? pending.transcriptPath;
  const title = await resolveSessionTitle(input.sessionId, transcriptPath, pending.promptTitle, options);

  await saveReviewEvent(
    {
      provider: options.provider,
      sessionId: input.sessionId,
      latestTurnId: input.turnId ?? pending.turnId,
      transcriptPath,
      title,
      projectPath: snapshot.projectPath,
      projectName: snapshot.projectName,
      branchName: snapshot.branchName,
      rawDiffPath,
      fileCount: stats.fileCount,
      additions: stats.additions,
      deletions: stats.deletions,
      startedAt: pending.startedAt,
      endedAt: now,
      updatedAt: now,
    },
    options,
  );
  await deletePendingBaseline(options.provider, input.sessionId, options);
}

/**
 * 会话标题「首轮固定」：已有标题原样沿用；否则优先取 transcript 首条用户消息（真实首轮），
 * 读取失败时回退本轮 prompt——会话首轮时两者等价。
 */
async function resolveSessionTitle(
  sessionId: string,
  transcriptPath: string | undefined,
  promptTitle: string | undefined,
  options: HookCollectorOptions,
): Promise<string | undefined> {
  const events = await readReviewEvents(options);
  const existingTitle = events.find(
    (event) => event.provider === options.provider && event.sessionId === sessionId,
  )?.title;

  if (existingTitle) {
    return existingTitle;
  }

  return (await extractFirstUserPromptFromTranscript(options.provider, transcriptPath)) ?? promptTitle;
}

async function createGitSnapshot(cwd: string): Promise<GitSnapshot | null> {
  const projectPath = await resolveProjectRoot(cwd);
  if (!projectPath) {
    return null;
  }

  const [branchName, tree] = await Promise.all([resolveBranchName(projectPath), writeWorktreeTree(projectPath)]);

  return {
    branchName,
    projectName: path.basename(projectPath),
    projectPath,
    tree,
  };
}

async function resolveProjectRoot(cwd: string) {
  try {
    const output = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
    return output.trim();
  } catch {
    return null;
  }
}

async function resolveBranchName(projectPath: string) {
  try {
    const branchName = (await runGit(projectPath, ["branch", "--show-current"])).trim();
    if (branchName) {
      return branchName;
    }
  } catch {
    // Detached HEAD is handled by the short hash fallback below.
  }

  try {
    return (await runGit(projectPath, ["rev-parse", "--short", "HEAD"])).trim();
  } catch {
    return "detached";
  }
}

async function writeWorktreeTree(projectPath: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vibe-reviewer-index-"));
  const indexPath = path.join(tempDir, "index");
  const env = {
    ...process.env,
    GIT_INDEX_FILE: indexPath,
  };

  await runGit(projectPath, ["read-tree", "HEAD"], env).catch(() => undefined);
  await runGit(projectPath, ["add", "-A"], env);
  return (await runGit(projectPath, ["write-tree"], env)).trim();
}

async function diffTrees(projectPath: string, baselineTree: string, currentTree: string) {
  return runGit(projectPath, ["diff", baselineTree, currentTree]);
}

async function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env,
    maxBuffer: 1024 * 1024 * 50,
  });

  return stdout;
}

function collectDiffStats(rawDiff: string): DiffStats {
  const filePaths = new Set<string>();
  let additions = 0;
  let deletions = 0;

  for (const line of rawDiff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      filePaths.add(line);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }

  return {
    additions,
    deletions,
    fileCount: filePaths.size,
  };
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseHookJson(rawInput: string) {
  try {
    return JSON.parse(rawInput);
  } catch {
    return null;
  }
}

function getString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
