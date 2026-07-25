import { BrowserWindow } from "electron";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { ipcChannels } from "../../shared/ipcChannels";

const PROJECT_CHANGE_DEBOUNCE_MS = 250;

/**
 * 工作区事件中直接丢弃的路径片段。
 * 只挡明确噪声目录；生成物目录（out/dist 等）仍会通知，由 diff 签名决定是否全量刷新，
 * 避免误伤其中已被跟踪的源码改动。
 */
const IGNORED_PATH_SEGMENTS = ["/node_modules/", "/.git/objects/", "/.git/logs/", "/.git/cursor/"];

const IGNORED_BASENAME_SUFFIXES = [".swp", ".swo", "~"];
const IGNORED_BASENAMES = new Set([".ds_store", "thumbs.db"]);

interface ProjectWatchEntry {
  refCount: number;
  watchers: FSWatcher[];
  debounceTimer: NodeJS.Timeout | null;
}

const projectWatchEntries = new Map<string, ProjectWatchEntry>();

/**
 * 开始监听项目工作区与关键 Git 元数据。
 * 同一路径支持引用计数，多处订阅只挂一套 watcher。
 */
export function watchProject(projectPath: string): void {
  const normalizedPath = normalizeProjectPath(projectPath);
  const existing = projectWatchEntries.get(normalizedPath);

  if (existing) {
    existing.refCount += 1;
    return;
  }

  const watchers: FSWatcher[] = [];

  const addWatcher = (watcher: FSWatcher | null) => {
    if (watcher) {
      watchers.push(watcher);
    }
  };

  // 工作区：Agent / 编辑器写文件。忽略 .git 内部，改由下方专用监听覆盖 index/HEAD/refs。
  // macOS 上 filename 可能为 null，此时仍要通知，否则 Codex 批量改文件会漏事件。
  addWatcher(
    createWatcher(normalizedPath, { recursive: true }, (relativePath) => {
      if (relativePath && isIgnoredWorktreePath(relativePath)) {
        return;
      }

      scheduleProjectChanged(normalizedPath);
    }),
  );

  // staged / 提交 / 切分支等不会改工作区文件，但会改 Git 元数据。
  addWatcher(createWatcher(path.join(normalizedPath, ".git", "index"), {}, () => scheduleProjectChanged(normalizedPath)));
  addWatcher(createWatcher(path.join(normalizedPath, ".git", "HEAD"), {}, () => scheduleProjectChanged(normalizedPath)));
  addWatcher(
    createWatcher(path.join(normalizedPath, ".git", "refs"), { recursive: true }, () => scheduleProjectChanged(normalizedPath)),
  );

  projectWatchEntries.set(normalizedPath, {
    refCount: 1,
    watchers,
    debounceTimer: null,
  });
}

/** 减少引用；引用归零时关闭该项目全部 watcher。 */
export function unwatchProject(projectPath: string): void {
  const normalizedPath = normalizeProjectPath(projectPath);
  const entry = projectWatchEntries.get(normalizedPath);

  if (!entry) {
    return;
  }

  entry.refCount -= 1;

  if (entry.refCount > 0) {
    return;
  }

  closeProjectWatchEntry(normalizedPath, entry);
  projectWatchEntries.delete(normalizedPath);
}

/** 应用退出时释放全部项目监听。 */
export function stopAllProjectWatchers(): void {
  for (const [projectPath, entry] of projectWatchEntries) {
    closeProjectWatchEntry(projectPath, entry);
  }

  projectWatchEntries.clear();
}

function createWatcher(
  targetPath: string,
  options: { recursive?: boolean },
  onChange: (relativePath: string | null) => void,
): FSWatcher | null {
  try {
    return watch(targetPath, { persistent: false, ...options }, (_eventType, fileName) => {
      onChange(fileName ? fileName.toString() : null);
    });
  } catch {
    // 非 git 仓库或缺文件时静默跳过，避免阻断审查页。
    return null;
  }
}

function scheduleProjectChanged(projectPath: string) {
  const entry = projectWatchEntries.get(projectPath);

  if (!entry) {
    return;
  }

  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer);
  }

  entry.debounceTimer = setTimeout(() => {
    entry.debounceTimer = null;
    broadcastProjectChanged(projectPath);
  }, PROJECT_CHANGE_DEBOUNCE_MS);
}

function broadcastProjectChanged(projectPath: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.reviewProjectChanged, { projectPath });
    }
  }
}

function closeProjectWatchEntry(_projectPath: string, entry: ProjectWatchEntry) {
  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = null;
  }

  for (const watcher of entry.watchers) {
    watcher.close();
  }
}

function normalizeProjectPath(projectPath: string) {
  return path.resolve(projectPath);
}

function isIgnoredWorktreePath(relativePath: string) {
  const normalized = `/${relativePath.replace(/\\/g, "/").replace(/^\/+/, "")}`.toLowerCase();

  // 工作区 recursive 监听不处理 .git 内部，避免 objects 洪泛；index/HEAD/refs 有专用 watcher。
  if (normalized === "/.git" || normalized.startsWith("/.git/")) {
    return true;
  }

  if (IGNORED_PATH_SEGMENTS.some((segment) => normalized.includes(segment))) {
    return true;
  }

  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);

  if (IGNORED_BASENAMES.has(basename)) {
    return true;
  }

  return IGNORED_BASENAME_SUFFIXES.some((suffix) => basename.endsWith(suffix));
}
