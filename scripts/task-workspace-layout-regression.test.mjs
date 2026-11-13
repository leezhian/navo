import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
  clear: () => { memory.clear(); },
};

const load = createLoader();
const {
  defaultTaskWorkspaceLayout,
  readTaskWorkspaceLayout,
  writeTaskWorkspaceLayout,
} = load("src/utils/taskWorkspaceLayout.ts");

test("布局读写：按任务隔离，跨读取保留", () => {
  memory.clear();
  assert.equal(readTaskWorkspaceLayout("a"), null);
  const base = defaultTaskWorkspaceLayout();
  writeTaskWorkspaceLayout("a", { ...base, railWidth: 240, terminalOpen: true, expanded: true });
  writeTaskWorkspaceLayout("b", { ...base, railWidth: 180, contextOpen: false });
  const a = readTaskWorkspaceLayout("a");
  const b = readTaskWorkspaceLayout("b");
  assert.equal(a.railWidth, 240);
  assert.equal(a.terminalOpen, true);
  assert.equal(a.expanded, true);
  assert.equal(b.railWidth, 180);
  assert.equal(b.contextOpen, false);
  assert.notEqual(a.railWidth, b.railWidth);
});

test("布局归一化：宽度越界夹紧；开闭语义严格", () => {
  memory.clear();
  writeTaskWorkspaceLayout("ok", {
    railWidth: 999,
    rightWidth: 10,
    terminalHeight: Number.NaN,
    contextOpen: false,
    rightOpen: false,
    terminalOpen: true,
    expanded: true,
  });
  const layout = readTaskWorkspaceLayout("ok");
  assert.equal(layout.railWidth, 300);
  assert.equal(layout.rightWidth, 268);
  assert.equal(layout.terminalHeight, defaultTaskWorkspaceLayout().terminalHeight);
  assert.equal(layout.contextOpen, false);
  assert.equal(layout.rightOpen, false);
  assert.equal(layout.terminalOpen, true);
  assert.equal(layout.expanded, true);

  // 脏值：侧栏仅严格 false 才关闭；终端仅严格 true 才打开
  writeTaskWorkspaceLayout("dirty", {
    railWidth: 200,
    rightWidth: 300,
    terminalHeight: 150,
    contextOpen: "no",
    rightOpen: 0,
    terminalOpen: 1,
    expanded: "yes",
  });
  const dirty = readTaskWorkspaceLayout("dirty");
  assert.equal(dirty.contextOpen, true);
  assert.equal(dirty.rightOpen, true);
  assert.equal(dirty.terminalOpen, false);
  assert.equal(dirty.expanded, false);
  assert.equal(readTaskWorkspaceLayout("missing"), null);
});

test("布局存储损坏时读空，写入仍可用", () => {
  memory.clear();
  memory.set("navo:task-workspace-layouts", "{not-json");
  assert.equal(readTaskWorkspaceLayout("x"), null);
  writeTaskWorkspaceLayout("x", defaultTaskWorkspaceLayout());
  assert.ok(readTaskWorkspaceLayout("x"));
});
