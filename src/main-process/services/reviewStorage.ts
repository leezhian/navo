import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentType, ReviewProvider, ReviewSession } from "@/domain/types";
import type { CleanReviewStorageResult } from "@/shared/electronApi";

const APP_DATA_DIR_NAME = "Navo";
const LEGACY_APP_DATA_DIR_NAME = "Vibe Reviewer";

/** 旧版遗留基线的最长保留时长；当前版本不再生成基线。 */
const STALE_PENDING_BASELINE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** 日志文件保留时长。 */
const STALE_LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ReviewSessionEvent {
  provider: ReviewProvider;
  sessionId: string;
  latestTurnId?: string;
  transcriptPath?: string;
  /** 会话标题：首轮用户 prompt，一经写入后续事件原样沿用。 */
  title?: string;
  projectPath: string;
  projectName: string;
  branchName: string;
  rawDiffPath: string;
  fileCount: number;
  additions: number;
  deletions: number;
  startedAt: string;
  endedAt: string;
  updatedAt: string;
}

export interface ReviewStoragePaths {
  rootDir: string;
  eventsPath: string;
  sessionsPath: string;
  pendingDir: string;
  diffsDir: string;
  logsDir: string;
}

interface ReviewSessionState {
  id: string;
  unread: boolean;
  updatedAt: string;
}

export interface ReviewStorageOptions {
  rootDir?: string;
}

export function getReviewStoragePaths(options: ReviewStorageOptions = {}): ReviewStoragePaths {
  const rootDir = options.rootDir ?? getDefaultStorageRoot();

  return {
    rootDir,
    eventsPath: path.join(rootDir, "events.jsonl"),
    sessionsPath: path.join(rootDir, "sessions.json"),
    pendingDir: path.join(rootDir, "pending"),
    diffsDir: path.join(rootDir, "diffs"),
    logsDir: path.join(rootDir, "logs"),
  };
}

export async function ensureReviewStorage(options: ReviewStorageOptions = {}) {
  const paths = getReviewStoragePaths(options);

  await Promise.all([
    mkdir(paths.rootDir, { recursive: true }),
    mkdir(paths.diffsDir, { recursive: true }),
  ]);

  return paths;
}

export function getLatestPatchPath(
  provider: ReviewProvider,
  sessionId: string,
  options: ReviewStorageOptions = {},
) {
  const paths = getReviewStoragePaths(options);
  return path.join(paths.diffsDir, provider, sanitizePathSegment(sessionId), "latest.patch");
}

export async function readLatestPatch(rawDiffPath?: string): Promise<string | null> {
  if (!rawDiffPath) {
    return null;
  }

  try {
    return await readFile(rawDiffPath, "utf8");
  } catch {
    return null;
  }
}

export async function readReviewEvents(options: ReviewStorageOptions = {}): Promise<ReviewSessionEvent[]> {
  const paths = getReviewStoragePaths(options);

  try {
    const content = await readFile(paths.eventsPath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap(parseReviewEventLine);
  } catch {
    return [];
  }
}

/** 事件日志的唯一写入出口，统一序列化格式与空文件边界处理。 */
async function writeReviewEvents(events: ReviewSessionEvent[], options: ReviewStorageOptions = {}) {
  const paths = await ensureReviewStorage(options);
  const content = events.map((event) => JSON.stringify(event)).join("\n");
  await writeFile(paths.eventsPath, content ? `${content}\n` : "", "utf8");
}

export function aggregateReviewSessions(
  events: ReviewSessionEvent[],
  states: Map<string, ReviewSessionState> = new Map(),
): ReviewSession[] {
  return pickLatestSessionEvents(events)
    .map((event) => toReviewSession(event, states.get(getReviewSessionKey(event.provider, event.sessionId))))
    .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime());
}

// 每个会话取 updatedAt 最新的一条：兼容旧版本按 turn 存多行的 events.jsonl，
// 旧的多余行会在写入侧压缩或缓存清理时移除。
function pickLatestSessionEvents(events: ReviewSessionEvent[]): ReviewSessionEvent[] {
  const sessions = new Map<string, ReviewSessionEvent>();

  for (const event of events) {
    const sessionKey = getReviewSessionKey(event.provider, event.sessionId);
    const current = sessions.get(sessionKey);

    if (!current || new Date(event.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      sessions.set(sessionKey, event);
    }
  }

  return [...sessions.values()];
}

export async function loadReviewSessions(options: ReviewStorageOptions = {}) {
  const [events, states] = await Promise.all([readReviewEvents(options), readReviewSessionStates(options)]);
  return aggregateReviewSessions(events, states);
}

export async function markReviewSessionRead(
  sessionId: string,
  updatedAt: string,
  options: ReviewStorageOptions = {},
) {
  const states = await readReviewSessionStates(options);
  states.set(sessionId, {
    ...(states.get(sessionId) ?? {}),
    id: sessionId,
    unread: false,
    updatedAt,
  });
  await writeReviewSessionStates(states, options);
}

/**
 * 归档会话：删除该会话的本地记录（事件行、diff 目录与已读状态）。
 */
export async function archiveReviewSession(sessionId: string, options: ReviewStorageOptions = {}) {
  const events = await readReviewEvents(options);
  // 同一会话的事件行共享 provider 与原始 sessionId，取任意一条即可定位 diff 目录。
  const archivedEvent = events.find(
    (event) => getReviewSessionKey(event.provider, event.sessionId) === sessionId,
  );

  if (archivedEvent) {
    const remainingEvents = events.filter(
      (event) => getReviewSessionKey(event.provider, event.sessionId) !== sessionId,
    );
    await writeReviewEvents(remainingEvents, options);
    await rm(path.dirname(getLatestPatchPath(archivedEvent.provider, archivedEvent.sessionId, options)), {
      force: true,
      recursive: true,
    });
  }

  const states = await readReviewSessionStates(options);
  if (states.delete(sessionId)) {
    await writeReviewSessionStates(states, options);
  }
}

/**
 * 清理不再对应会话列表的本地缓存：孤儿 diff 目录、超龄 pending 基线、
 * 孤儿已读状态、旧版多行事件与超龄日志。列表中的会话数据不受影响。
 */
export async function cleanupReviewStorage(
  options: ReviewStorageOptions = {},
): Promise<CleanReviewStorageResult> {
  const paths = await ensureReviewStorage(options);
  let removedItems = 0;
  let freedBytes = 0;

  // 压缩旧版按 turn 存多行的事件日志，并以压缩结果作为存活会话集合。
  const events = await readReviewEvents(options);
  const latestEvents = pickLatestSessionEvents(events);
  if (latestEvents.length !== events.length) {
    await writeReviewEvents(latestEvents, options);
    removedItems += events.length - latestEvents.length;
  }

  // 删除不属于任何存活会话的 diff 目录。
  const liveDiffDirs = new Set(
    latestEvents.map((event) => path.dirname(getLatestPatchPath(event.provider, event.sessionId, options))),
  );
  for (const providerName of await listDirectory(paths.diffsDir)) {
    const providerDir = path.join(paths.diffsDir, providerName);
    for (const sessionDirName of await listDirectory(providerDir)) {
      const sessionDir = path.join(providerDir, sessionDirName);
      if (liveDiffDirs.has(sessionDir)) {
        continue;
      }
      freedBytes += await getPathSize(sessionDir);
      await rm(sessionDir, { force: true, recursive: true });
      removedItems += 1;
    }
  }

  // 删除超龄 pending 基线；近期基线可能属于进行中的轮次，一律保留。
  const stalePendingResult = await removeStaleFiles(paths.pendingDir, STALE_PENDING_BASELINE_MAX_AGE_MS);
  removedItems += stalePendingResult.removedCount;
  freedBytes += stalePendingResult.freedBytes;

  // 剔除不再对应任何会话的已读状态。
  const liveSessionKeys = new Set(
    latestEvents.map((event) => getReviewSessionKey(event.provider, event.sessionId)),
  );
  const states = await readReviewSessionStates(options);
  const staleStateIds = [...states.keys()].filter((id) => !liveSessionKeys.has(id));
  if (staleStateIds.length > 0) {
    for (const id of staleStateIds) {
      states.delete(id);
    }
    await writeReviewSessionStates(states, options);
    removedItems += staleStateIds.length;
  }

  // 删除超龄日志。
  const staleLogsResult = await removeStaleFiles(paths.logsDir, STALE_LOG_MAX_AGE_MS);
  removedItems += staleLogsResult.removedCount;
  freedBytes += staleLogsResult.freedBytes;

  return { removedItems, freedBytes };
}

/** 递归删除目录下修改时间超龄的文件，返回删除数量与释放的字节数。 */
async function removeStaleFiles(
  dirPath: string,
  maxAgeMs: number,
): Promise<{ removedCount: number; freedBytes: number }> {
  const deadline = Date.now() - maxAgeMs;
  let removedCount = 0;
  let freedBytes = 0;

  for (const entryName of await listDirectory(dirPath)) {
    const entryPath = path.join(dirPath, entryName);
    const entryStat = await stat(entryPath).catch(() => null);

    if (!entryStat) {
      continue;
    }

    if (entryStat.isDirectory()) {
      const childResult = await removeStaleFiles(entryPath, maxAgeMs);
      removedCount += childResult.removedCount;
      freedBytes += childResult.freedBytes;
      continue;
    }

    if (entryStat.isFile() && entryStat.mtimeMs < deadline) {
      freedBytes += entryStat.size;
      await rm(entryPath, { force: true });
      removedCount += 1;
    }
  }

  return { removedCount, freedBytes };
}

async function listDirectory(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

async function getPathSize(targetPath: string): Promise<number> {
  const targetStat = await stat(targetPath).catch(() => null);
  if (!targetStat) {
    return 0;
  }

  if (targetStat.isFile()) {
    return targetStat.size;
  }

  if (!targetStat.isDirectory()) {
    return 0;
  }

  let totalSize = 0;
  for (const childName of await listDirectory(targetPath)) {
    totalSize += await getPathSize(path.join(targetPath, childName));
  }
  return totalSize;
}

export function getReviewSessionKey(provider: ReviewProvider, sessionId: string) {
  return `${provider}:${sessionId}`;
}

function toReviewSession(event: ReviewSessionEvent, state?: ReviewSessionState): ReviewSession {
  const id = getReviewSessionKey(event.provider, event.sessionId);
  const isSameVersion = state?.updatedAt === event.updatedAt;

  return {
    id,
    agent: getAgentType(event.provider),
    title: event.title,
    projectPath: event.projectPath,
    projectName: event.projectName,
    branchName: event.branchName,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    updatedAt: event.updatedAt,
    fileCount: event.fileCount,
    additions: event.additions,
    deletions: event.deletions,
    unread: isSameVersion ? state.unread : true,
    rawDiffPath: event.rawDiffPath,
  };
}

async function readReviewSessionStates(options: ReviewStorageOptions = {}) {
  const paths = getReviewStoragePaths(options);
  const states = await readJsonFile<ReviewSessionState[]>(paths.sessionsPath);

  return new Map((states ?? []).map((state) => [state.id, state]));
}

async function writeReviewSessionStates(
  states: Map<string, ReviewSessionState>,
  options: ReviewStorageOptions = {},
) {
  const paths = await ensureReviewStorage(options);
  await writeJsonFile(paths.sessionsPath, [...states.values()]);
}

function getAgentType(provider: ReviewProvider): AgentType {
  return provider === "codex" ? "ChatGPT" : "Claude Code";
}

function parseReviewEventLine(line: string): ReviewSessionEvent[] {
  try {
    return [JSON.parse(line) as ReviewSessionEvent];
  } catch {
    return [];
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getDefaultStorageRoot() {
  const appDataPath = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support")
    : process.platform === "win32"
      ? process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")
      : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  const rootDir = path.join(appDataPath, APP_DATA_DIR_NAME);
  const legacyRootDir = path.join(appDataPath, LEGACY_APP_DATA_DIR_NAME);

  // 不移动历史 patch：事件中保存了绝对路径，继续读取旧目录才能保持快照可用。
  return !existsSync(rootDir) && existsSync(legacyRootDir) ? legacyRootDir : rootDir;
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
