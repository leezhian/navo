import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const compiledDir = path.join(tmpdir(), "vibe-reviewer-regression-tests");

mkdirSync(compiledDir, { recursive: true });

async function importTs(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const outputPath = path.join(compiledDir, `${relativePath.replace(/[^\w]+/g, "-")}.mjs`);

  writeFileSync(outputPath, output.outputText);
  return import(pathToFileURL(outputPath).href);
}

const { mergeLoadedSessions } = await importTs("src/domain/reviewSessionMerge.ts");
const { mergeSoftRefreshSummary, resolveCollapsedFileIds, resolveSelectedFileId } = await importTs(
  "src/hooks/reviewDataState.ts",
);
const { toCodeViewItems } = await importTs("src/components/review/diff-code-view/diffCodeViewItems.ts");
const diffCodeViewSource = readFileSync(path.join(projectRoot, "src/components/review/diff-code-view/DiffCodeView.tsx"), "utf8");
const diffPreviewSource = readFileSync(path.join(projectRoot, "src/components/settings/DiffPreview.tsx"), "utf8");
const agentHookConfigSource = readFileSync(path.join(projectRoot, "src/main-process/services/agentHookConfigService.ts"), "utf8");
const hookBridgeSource = readFileSync(path.join(projectRoot, "src/main-process/services/hookBridgeService.ts"), "utf8");
const appSource = readFileSync(path.join(projectRoot, "src/App.tsx"), "utf8");
const electronApiSource = readFileSync(path.join(projectRoot, "src/shared/electronApi.ts"), "utf8");
const ipcChannelsSource = readFileSync(path.join(projectRoot, "src/shared/ipcChannels.ts"), "utf8");
const preloadSource = readFileSync(path.join(projectRoot, "src/preload.ts"), "utf8");

function createFile(id, isLarge = false, cacheKey = `cache-${id}`) {
  return {
    id,
    displayPath: `${id}.ts`,
    isLarge,
    status: "modified",
    additions: 1,
    deletions: 0,
    isBinary: false,
    pierreFile: { cacheKey },
  };
}

function createSession(id, updatedAt = "2026-07-06T00:00:00.000Z", unread = true) {
  return { id, updatedAt, unread, projectName: id };
}

test("保留仍然存在的当前选中文件", () => {
  const files = [createFile("first"), createFile("current")];

  assert.equal(resolveSelectedFileId(files, "current"), "current");
});

test("当前选中文件不存在时回退到第一个文件", () => {
  const files = [createFile("first"), createFile("second")];

  assert.equal(resolveSelectedFileId(files, "missing"), "first");
});

test("刷新后保留已有折叠选择，并让新增大文件默认折叠", () => {
  const files = [createFile("kept"), createFile("open-large", true), createFile("new-large", true)];
  const currentCollapsedFileIds = new Set(["kept", "removed"]);
  const previousFileIds = new Set(["kept", "open-large", "removed"]);

  assert.deepEqual(resolveCollapsedFileIds(files, currentCollapsedFileIds, previousFileIds), new Set(["kept", "new-large"]));
});

test("未变化的 session 轮询结果复用当前对象引用", () => {
  const currentSession = createSession("same", "2026-07-06T00:00:00.000Z", false);
  const loadedSession = createSession("same", "2026-07-06T00:00:00.000Z", true);

  const [mergedSession] = mergeLoadedSessions([currentSession], [loadedSession]);

  assert.equal(mergedSession, currentSession);
  assert.equal(mergedSession.unread, false);
});

test("变化的 session 使用最新对象", () => {
  const currentSession = createSession("same", "2026-07-06T00:00:00.000Z", false);
  const loadedSession = createSession("same", "2026-07-06T00:01:00.000Z", true);

  const [mergedSession] = mergeLoadedSessions([currentSession], [loadedSession]);

  assert.notEqual(mergedSession, currentSession);
  assert.equal(mergedSession, loadedSession);
});

test("CodeView item version 随受控字段变化", () => {
  const [openItem] = toCodeViewItems([createFile("file")], new Set(), new Map());
  const [collapsedItem] = toCodeViewItems([createFile("file")], new Set(["file"]), new Map());

  assert.equal(typeof openItem.version, "number");
  assert.notEqual(openItem.version, collapsedItem.version);
});

test("review diff 主区域启用 WorkerPool provider", () => {
  assert.match(diffCodeViewSource, /WorkerPoolContextProvider/);
  assert.match(diffCodeViewSource, /diffWorkerPoolOptions/);
});

test("设置预览继续禁用 worker pool", () => {
  assert.match(diffPreviewSource, /<PatchDiff[^>]*disableWorkerPool/);
});

test("Agent hook 命令使用独立 bridge，避免启动 Electron 主 App", () => {
  assert.match(hookBridgeSource, /vibe-reviewer-hook/);
  assert.match(agentHookConfigSource, /createHookBridgeCommand/);
  assert.doesNotMatch(agentHookConfigSource, /--hook collect/);
});

test("会话刷新使用主进程推送而不是 5 秒轮询", () => {
  assert.doesNotMatch(appSource, /setInterval\(refreshSessions,\s*5000\)/);
  assert.match(electronApiSource, /onSessionsChanged/);
  assert.match(ipcChannelsSource, /reviewSessionsChanged/);
  assert.match(preloadSource, /reviewSessionsChanged/);
});

test("diff 自动刷新走项目监听与签名 IPC，而不是定时轮询", () => {
  const useReviewDataSource = readFileSync(path.join(projectRoot, "src/hooks/useReviewData.ts"), "utf8");
  const liveSyncSource = readFileSync(path.join(projectRoot, "src/hooks/useLiveProjectDiffSync.ts"), "utf8");
  const projectWatcherSource = readFileSync(
    path.join(projectRoot, "src/main-process/services/projectChangeWatcher.ts"),
    "utf8",
  );
  const gitReviewServiceSource = readFileSync(
    path.join(projectRoot, "src/main-process/services/gitReviewService.ts"),
    "utf8",
  );

  assert.doesNotMatch(useReviewDataSource, /setInterval/);
  assert.doesNotMatch(liveSyncSource, /setInterval/);
  assert.match(liveSyncSource, /onProjectChanged/);
  assert.match(liveSyncSource, /watchProject/);
  assert.match(liveSyncSource, /loadReviewDiffSignature/);
  assert.match(useReviewDataSource, /useLiveProjectDiffSync/);
  assert.match(useReviewDataSource, /getHardReloadKey/);
  assert.match(projectWatcherSource, /reviewProjectChanged/);
  assert.match(gitReviewServiceSource, /getGitDiffSignature/);
  assert.match(gitReviewServiceSource, /getUntrackedFileCount/);
  assert.match(electronApiSource, /onProjectChanged/);
  assert.match(electronApiSource, /watchProject/);
  assert.match(ipcChannelsSource, /reviewProjectChanged/);
  assert.match(preloadSource, /onProjectChanged/);
});

test("硬刷新依赖键区分 live 与 previous-session", async () => {
  const { getHardReloadKey, isLiveCompareMode } = await importTs("src/hooks/reviewCompareMode.ts");
  const session = {
    id: "s1",
    projectPath: "/repo",
    updatedAt: "t1",
    rawDiffPath: "/patch",
  };

  assert.equal(isLiveCompareMode("unstaged"), true);
  assert.equal(isLiveCompareMode("previous-session"), false);

  const liveKey = getHardReloadKey(session, "unstaged", "main");
  const liveBranchKey = getHardReloadKey(session, "unstaged", "dev");
  const previousKey = getHardReloadKey(session, "previous-session", "main");
  const previousUpdated = getHardReloadKey({ ...session, updatedAt: "t2" }, "previous-session", "main");

  assert.notEqual(liveKey, liveBranchKey);
  assert.notEqual(liveKey, previousKey);
  assert.notEqual(previousKey, previousUpdated);
  // previous-session 不跟目标分支绑定
  assert.equal(previousKey, getHardReloadKey(session, "previous-session", "dev"));
});

test("对比方式存储只接受合法枚举", async () => {
  const { readStoredCompareMode, writeStoredCompareMode } = await importTs("src/hooks/compareModeStorage.ts");

  writeStoredCompareMode("unstaged");
  assert.equal(readStoredCompareMode(), "unstaged");

  writeStoredCompareMode("staged");
  assert.equal(readStoredCompareMode(), "staged");
});

test("软刷新复用未改动文件引用，只替换内容变化的文件", () => {
  const kept = createFile("kept", false, "cache-kept-v1");
  const changedPrevious = createFile("changed", false, "cache-changed-v1");
  const previous = {
    files: [kept, changedPrevious],
    additions: 2,
    deletions: 0,
    fileCount: 2,
    isLargeDiff: false,
  };

  const changedNext = createFile("changed", false, "cache-changed-v2");
  const next = {
    files: [createFile("kept", false, "cache-kept-v1"), changedNext],
    additions: 3,
    deletions: 0,
    fileCount: 2,
    isLargeDiff: false,
  };

  const merged = mergeSoftRefreshSummary(previous, next);

  assert.equal(merged.files[0], kept);
  assert.equal(merged.files[1], changedNext);
  assert.equal(merged.additions, 3);
});

test("CodeView item 在 version 不变时复用旧对象", () => {
  const file = createFile("stable");
  const first = toCodeViewItems([file], new Set(), new Map());
  const second = toCodeViewItems([file], new Set(), new Map(), first);

  assert.equal(second[0], first[0]);
});
