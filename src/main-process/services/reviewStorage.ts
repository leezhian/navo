import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentType, ReviewProvider, ReviewSession } from "@/domain/types";

const APP_DATA_DIR_NAME = "Vibe Reviewer";

export interface ReviewSessionEvent {
  provider: ReviewProvider;
  sessionId: string;
  latestTurnId?: string;
  transcriptPath?: string;
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

export interface PendingReviewBaseline {
  provider: ReviewProvider;
  sessionId: string;
  turnId?: string;
  transcriptPath?: string;
  projectPath: string;
  projectName: string;
  branchName: string;
  baselineTree: string;
  startedAt: string;
  updatedAt: string;
}

export interface ReviewStoragePaths {
  rootDir: string;
  eventsPath: string;
  sessionsPath: string;
  pendingDir: string;
  diffsDir: string;
}

interface ReviewSessionState {
  archived?: boolean;
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
  };
}

export async function ensureReviewStorage(options: ReviewStorageOptions = {}) {
  const paths = getReviewStoragePaths(options);

  await Promise.all([
    mkdir(paths.rootDir, { recursive: true }),
    mkdir(paths.pendingDir, { recursive: true }),
    mkdir(paths.diffsDir, { recursive: true }),
  ]);

  return paths;
}

export function getPendingBaselinePath(
  provider: ReviewProvider,
  sessionId: string,
  options: ReviewStorageOptions = {},
) {
  const paths = getReviewStoragePaths(options);
  return path.join(paths.pendingDir, provider, `${sanitizePathSegment(sessionId)}.json`);
}

export function getLatestPatchPath(
  provider: ReviewProvider,
  sessionId: string,
  options: ReviewStorageOptions = {},
) {
  const paths = getReviewStoragePaths(options);
  return path.join(paths.diffsDir, provider, sanitizePathSegment(sessionId), "latest.patch");
}

export async function writePendingBaseline(
  baseline: PendingReviewBaseline,
  options: ReviewStorageOptions = {},
) {
  const filePath = getPendingBaselinePath(baseline.provider, baseline.sessionId, options);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonFile(filePath, baseline);
}

export async function readPendingBaseline(
  provider: ReviewProvider,
  sessionId: string,
  options: ReviewStorageOptions = {},
): Promise<PendingReviewBaseline | null> {
  const filePath = getPendingBaselinePath(provider, sessionId, options);
  return readJsonFile<PendingReviewBaseline>(filePath);
}

export async function deletePendingBaseline(
  provider: ReviewProvider,
  sessionId: string,
  options: ReviewStorageOptions = {},
) {
  const filePath = getPendingBaselinePath(provider, sessionId, options);
  await rm(filePath, { force: true });
}

export async function writeLatestPatch(
  provider: ReviewProvider,
  sessionId: string,
  rawDiff: string,
  options: ReviewStorageOptions = {},
) {
  const filePath = getLatestPatchPath(provider, sessionId, options);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, rawDiff, "utf8");
  return filePath;
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

// 每个会话只保留最新一条事件：历史 turn 的 diff 已被 latest.patch 覆盖，
// 列表展示也只消费最新事件，按 turn 保留历史行只会让文件无上限增长。
export async function saveReviewEvent(
  event: ReviewSessionEvent,
  options: ReviewStorageOptions = {},
) {
  const paths = await ensureReviewStorage(options);
  const events = await readReviewEvents(options);
  const eventKey = getReviewSessionKey(event.provider, event.sessionId);
  const otherEvents = events.filter(
    (item) => getReviewSessionKey(item.provider, item.sessionId) !== eventKey,
  );
  const nextContent = [...otherEvents, event].map((item) => JSON.stringify(item)).join("\n");
  await writeFile(paths.eventsPath, `${nextContent}\n`, "utf8");
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

// 读取侧仍按「同会话取 updatedAt 最新」聚合：兼容旧版本按 turn 存多行的 events.jsonl，
// 旧的多余行会在对应会话下次产生新事件时被写入侧压缩掉。
export function aggregateReviewSessions(
  events: ReviewSessionEvent[],
  states: Map<string, ReviewSessionState> = new Map(),
): ReviewSession[] {
  const sessions = new Map<string, ReviewSessionEvent>();

  for (const event of events) {
    const sessionKey = getReviewSessionKey(event.provider, event.sessionId);
    const current = sessions.get(sessionKey);

    if (!current || new Date(event.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      sessions.set(sessionKey, event);
    }
  }

  return [...sessions.values()]
    .map((event) => toReviewSession(event, states.get(getReviewSessionKey(event.provider, event.sessionId))))
    .filter((session) => !states.get(session.id)?.archived)
    .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime());
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

export function getReviewSessionKey(provider: ReviewProvider, sessionId: string) {
  return `${provider}:${sessionId}`;
}

function toReviewSession(event: ReviewSessionEvent, state?: ReviewSessionState): ReviewSession {
  const id = getReviewSessionKey(event.provider, event.sessionId);
  const isSameVersion = state?.updatedAt === event.updatedAt;

  return {
    id,
    agent: getAgentType(event.provider),
    provider: event.provider,
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
    hasBaseline: true,
    latestTurnId: event.latestTurnId,
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
  return provider === "codex" ? "Codex" : "Claude Code";
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
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_DATA_DIR_NAME);
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), APP_DATA_DIR_NAME);
  }

  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), APP_DATA_DIR_NAME);
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
