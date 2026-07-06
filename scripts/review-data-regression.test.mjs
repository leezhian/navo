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
const { resolveCollapsedFileIds, resolveSelectedFileId } = await importTs("src/hooks/reviewDataState.ts");
const { toCodeViewItems } = await importTs("src/components/review/diff-code-view/diffCodeViewItems.ts");
const diffCodeViewSource = readFileSync(path.join(projectRoot, "src/components/review/diff-code-view/DiffCodeView.tsx"), "utf8");
const diffPreviewSource = readFileSync(path.join(projectRoot, "src/components/settings/DiffPreview.tsx"), "utf8");
const agentHookConfigSource = readFileSync(path.join(projectRoot, "src/main-process/services/agentHookConfigService.ts"), "utf8");
const hookBridgeSource = readFileSync(path.join(projectRoot, "src/main-process/services/hookBridgeService.ts"), "utf8");
const appSource = readFileSync(path.join(projectRoot, "src/App.tsx"), "utf8");
const electronApiSource = readFileSync(path.join(projectRoot, "src/shared/electronApi.ts"), "utf8");
const ipcChannelsSource = readFileSync(path.join(projectRoot, "src/shared/ipcChannels.ts"), "utf8");
const preloadSource = readFileSync(path.join(projectRoot, "src/preload.ts"), "utf8");

function createFile(id, isLarge = false) {
  return {
    id,
    displayPath: `${id}.ts`,
    isLarge,
    pierreFile: { cacheKey: `cache-${id}` },
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
