import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import ts from "typescript";
import path from "node:path";
import { createRequire } from "node:module";

async function importTs(file) {
  const require = createRequire(import.meta.url);
  function load(filePath) {
    const source = readFileSync(filePath, "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    const module = { exports: {} };
    const localRequire = (name) => name.startsWith(".") ? load(path.resolve(path.dirname(filePath), name) + ".ts") : require(name);
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(path.resolve(file));
}

const { moveTask } = await importTs("src/utils/taskState.ts");
const { navigateTo, stepNavigation } = await importTs("src/domain/navigation.ts");
const { isTask, isIssueItem, parseStoredItems } = await importTs("src/utils/adeDataValidation.ts");
const { filterTasks, orderTasks } = await importTs("src/utils/taskView.ts");
const { filterIssues, orderIssues, moveIssue, mergeIssueItems } = await importTs("src/utils/issueView.ts");
const { bindDevelopmentTools } = await importTs("src/main-process/developmentTools.ts");
const { useTaskTabsStore } = await importTs("src/stores/taskTabsStore.ts");
const { taskTabGroups } = await importTs("src/domain/taskSplit.ts");
const first = { id: "first", title: "任务一", date: "2026-09-30", projectName: "navo", status: "TODO" };
const second = { ...first, id: "second", title: "任务二" };
const third = { ...first, id: "third", status: "DONE" };

test("Issue 刷新更新内容和增删结果，保留已有手动顺序且不修改输入", () => {
  const original = [third, second, first];
  const updated = { ...first, title: "更新后的标题" };
  const added = { ...first, id: "new" };
  assert.deepEqual(mergeIssueItems(original, [updated, third, added]), [third, updated, added]);
  assert.deepEqual(original, [third, second, first]);
  assert.deepEqual(mergeIssueItems(original, []), []);
  assert.deepEqual(mergeIssueItems([], [added]), [added]);
});

test("Issue 同类型手动排序保留隐藏项、类型和另一组顺序，拒绝非法目标", () => {
  const firstPR = { ...first, id: "pr1", group: "PR", status: "review" };
  const hiddenPR = { ...firstPR, id: "hidden" };
  const secondPR = { ...firstPR, id: "pr2" };
  const issue = { ...firstPR, id: "issue1", group: "ISSUE", status: "todo" };
  const otherIssue = { ...issue, id: "issue2" };
  const items = [firstPR, hiddenPR, issue, secondPR, otherIssue];
  const moved = moveIssue(items, "pr2", "PR", "pr1");
  assert.deepEqual(moved.filter((item) => item.group === "PR"), [secondPR, firstPR, hiddenPR]);
  assert.deepEqual(moved.filter((item) => item.group === "ISSUE"), [issue, otherIssue]);
  assert.deepEqual(moveIssue(items, "pr1", "PR", null).filter((item) => item.group === "PR"), [hiddenPR, secondPR, firstPR]);
  assert.deepEqual(moveIssue(items, "issue2", "ISSUE", "issue1").filter((item) => item.group === "ISSUE"), [otherIssue, issue]);
  for (const [id, group, before] of [["pr1", "ISSUE", null], ["pr1", "PR", "issue1"], ["pr1", "PR", "missing"], ["missing", "PR", null], ["pr1", "PR", "pr1"]]) {
    assert.equal(moveIssue(items, id, group, before), items);
  }
  assert.deepEqual(new Set(moved.map((item) => item.id)), new Set(items.map((item) => item.id)));
  assert.deepEqual(items, [firstPR, hiddenPR, issue, secondPR, otherIssue]);
});

test("任务标签按标识去重，未打开任务不会被激活，返回面板保留标签", () => {
  useTaskTabsStore.setState({ taskIds: [], activeTaskId: null });
  const tabs = useTaskTabsStore.getState();
  assert.equal(tabs.activateTask("first"), false);
  tabs.openTask("first"); tabs.openTask("second"); tabs.openTask("first");
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["first", "second"]);
  assert.equal(useTaskTabsStore.getState().activeTaskId, "first");
  tabs.showOverview();
  assert.equal(useTaskTabsStore.getState().activeTaskId, null);
  assert.equal(tabs.activateTask("second"), true);
  assert.equal(useTaskTabsStore.getState().activeTaskId, "second");
});

test("标签重排后关闭遵循当前顺序，非当前关闭不改变选中", () => {
  useTaskTabsStore.setState({ taskIds: ["first", "second", "third"], activeTaskId: "second" });
  const tabs = useTaskTabsStore.getState();
  tabs.reorderTasks(["third", "second", "first"]);
  assert.equal(useTaskTabsStore.getState().activeTaskId, "second");
  tabs.closeTask("third");
  assert.equal(useTaskTabsStore.getState().activeTaskId, "second");
  tabs.closeTask("second");
  assert.equal(useTaskTabsStore.getState().activeTaskId, "first");
  tabs.openTask("third"); tabs.closeTask("third");
  assert.equal(useTaskTabsStore.getState().activeTaskId, "first");
  tabs.closeTask("first");
  assert.deepEqual(useTaskTabsStore.getState().taskIds, []);
  assert.equal(useTaskTabsStore.getState().activeTaskId, null);
});

test("关闭其他保留目标，非法排序不丢失标签，删除任务清理页面", () => {
  useTaskTabsStore.setState({ taskIds: ["first", "second", "third"], activeTaskId: "first" });
  const tabs = useTaskTabsStore.getState();
  tabs.reorderTasks(["first"]); tabs.reorderTasks(["first", "first", "third"]); tabs.reorderTasks(["first", "second", "missing"]);
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["first", "second", "third"]);
  tabs.retainTasks(["third"]);
  assert.equal(useTaskTabsStore.getState().activeTaskId, "third");
  tabs.openTask("first"); tabs.closeOtherTasks("third");
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["third"]);
  assert.equal(useTaskTabsStore.getState().activeTaskId, "third");
  tabs.closeOtherTasks("missing");
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["third"]);
  tabs.retainTasks([]);
  assert.equal(useTaskTabsStore.getState().activeTaskId, null);
});

test("拆分待选页只接受独立标签，拒绝自身、重复和嵌套", () => {
  useTaskTabsStore.setState({ taskIds: ["first", "second", "third", "fourth", "fifth"], activeTaskId: null, splits: [] });
  const actions = useTaskTabsStore.getState();
  actions.startSplit("first");
  const pending = useTaskTabsStore.getState().splits[0];
  assert.equal(pending.secondTaskId, null);
  actions.completeSplit(pending.id, "first");
  assert.equal(useTaskTabsStore.getState().splits[0].secondTaskId, null);
  actions.startSplit("third", "fourth");
  actions.completeSplit(pending.id, "third");
  assert.equal(useTaskTabsStore.getState().splits[0].secondTaskId, null);
  actions.completeSplit(pending.id, "second");
  actions.startSplit("first", "fifth");
  assert.equal(useTaskTabsStore.getState().splits.length, 2);
  assert.equal(useTaskTabsStore.getState().splits[0].secondTaskId, "second");
  actions.activateTask("first");
  assert.equal(useTaskTabsStore.getState().activeTaskId, "first");
});

test("独立标签交换到左右视图时，旧页面准确回到独立标签原位置", () => {
  for (const side of ["first", "second"]) {
    useTaskTabsStore.setState({ taskIds: ["outside", "first", "second", "after"], activeTaskId: "first", splits: [] });
    const actions = useTaskTabsStore.getState();
    actions.startSplit("first", "second");
    const split = useTaskTabsStore.getState().splits[0];
    actions.setSplitOrientation(split.id, "vertical");
    actions.setSplitRatio(split.id, 0.6);
    actions.swapIntoSplit(split.id, side, "outside");
    const state = useTaskTabsStore.getState();
    assert.deepEqual(state.taskIds, side === "first" ? ["first", "outside", "second", "after"] : ["second", "first", "outside", "after"]);
    assert.equal(state.splits[0][side === "first" ? "firstTaskId" : "secondTaskId"], "outside");
    assert.equal(state.splits[0].ratios.vertical, 0.6);
    assert.equal(state.activeTaskId, "outside");
    assert.equal(state.splits[0].id, split.id);
  }
});

test("方向比例分别保存，反转不丢焦点，组合可整体重排和取消", () => {
  useTaskTabsStore.setState({ taskIds: ["first", "outside", "second"], activeTaskId: "first", splits: [] });
  const actions = useTaskTabsStore.getState();
  actions.startSplit("first", "second");
  const split = useTaskTabsStore.getState().splits[0];
  actions.setSplitRatio(split.id, 0.6);
  actions.setSplitOrientation(split.id, "vertical");
  actions.setSplitRatio(split.id, 0.4);
  actions.reverseSplit(split.id);
  assert.equal(useTaskTabsStore.getState().activeTaskId, "first");
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["second", "first", "outside"]);
  assert.deepEqual(useTaskTabsStore.getState().splits[0].ratios, { horizontal: 0.6, vertical: 0.4 });
  actions.reorderTasks(["outside", split.id]);
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["outside", "second", "first"]);
  actions.cancelSplit(split.id);
  assert.equal(useTaskTabsStore.getState().splits.length, 0);
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["outside", "second", "first"]);
});

test("关闭组合任何一侧后激活剩余页，关闭其他保留整个组合", () => {
  for (const closed of ["first", "second"]) {
    useTaskTabsStore.setState({ taskIds: ["first", "second", "outside"], activeTaskId: null, splits: [] });
    const actions = useTaskTabsStore.getState();
    actions.startSplit("first", "second");
    actions.activateTask(closed);
    actions.closeTask(closed);
    assert.equal(useTaskTabsStore.getState().splits.length, 0);
    assert.equal(useTaskTabsStore.getState().activeTaskId, closed === "first" ? "second" : "first");
  }
  const actions = useTaskTabsStore.getState();
  actions.openTask("second"); actions.startSplit("first", "second"); actions.closeOtherTasks("second");
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["first", "second"]);
  assert.equal(useTaskTabsStore.getState().splits.length, 1);
  actions.retainTasks(["second"]);
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["second"]);
  assert.equal(useTaskTabsStore.getState().splits.length, 0);
});

test("取消待选页保留原页，删除待选组合的原页不遗留空标签", () => {
  useTaskTabsStore.setState({ taskIds: ["first", "second"], activeTaskId: null, splits: [] });
  const actions = useTaskTabsStore.getState();
  actions.startSplit("first"); actions.cancelSplit(useTaskTabsStore.getState().splits[0].id);
  assert.deepEqual(useTaskTabsStore.getState().taskIds, ["first", "second"]);
  actions.startSplit("first"); actions.closeTask("first");
  assert.equal(useTaskTabsStore.getState().splits.length, 0);
  assert.equal(useTaskTabsStore.getState().activeTaskId, "second");
});

test("连续拆分、交换、删除后任务和组合标识始终唯一", () => {
  useTaskTabsStore.setState({ taskIds: [], activeTaskId: null, splits: [] });
  const actions = useTaskTabsStore.getState();
  const ids = ["first", "second", "third", "fourth", "fifth"];
  let seed = 17;
  const next = (max) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const state = useTaskTabsStore.getState();
    const id = ids[next(ids.length)];
    const split = state.splits[next(Math.max(1, state.splits.length))];
    switch (next(8)) {
      case 0: actions.openTask(id); break;
      case 1: actions.closeTask(id); break;
      case 2: actions.startSplit(id, next(2) ? ids[next(ids.length)] : undefined); break;
      case 3: if (split) actions.completeSplit(split.id, id); break;
      case 4: if (split) actions.swapIntoSplit(split.id, next(2) ? "first" : "second", id); break;
      case 5: if (split) actions.reverseSplit(split.id); break;
      case 6: if (split) actions.cancelSplit(split.id); break;
      case 7: actions.retainTasks(ids.filter((value) => value !== id)); break;
    }
    const result = useTaskTabsStore.getState();
    assert.equal(new Set(result.taskIds).size, result.taskIds.length);
    assert.ok(result.activeTaskId === null || result.taskIds.includes(result.activeTaskId));
    const members = result.splits.flatMap((group) => [group.firstTaskId, ...(group.secondTaskId ? [group.secondTaskId] : [])]);
    assert.equal(new Set(members).size, members.length);
    assert.ok(members.every((value) => result.taskIds.includes(value)));
    assert.deepEqual(taskTabGroups(result.taskIds, result.splits).flatMap((group) => group.taskIds), result.taskIds);
  }
});

test("开发模式的 DevTools 快捷键不依赖菜单，按键只切换一次", () => {
  const webContents = new EventEmitter();
  let toggles = 0;
  let prevented = 0;
  webContents.toggleDevTools = () => { toggles += 1; };
  bindDevelopmentTools({ webContents }, true);
  const event = { preventDefault: () => { prevented += 1; } };
  const shortcut = { code: "KeyI", key: "i", meta: process.platform === "darwin", alt: process.platform === "darwin", control: process.platform !== "darwin", shift: process.platform !== "darwin" };
  webContents.emit("before-input-event", event, { ...shortcut, type: "keyDown" });
  webContents.emit("before-input-event", event, { ...shortcut, type: "keyUp" });
  webContents.emit("before-input-event", event, { ...shortcut, type: "keyDown", isAutoRepeat: true });
  webContents.emit("before-input-event", event, { type: "keyDown", key: "F12", code: "F12" });
  webContents.emit("before-input-event", event, { type: "keyDown", key: "i", code: "KeyI" });
  assert.equal(toggles, 2);
  assert.equal(prevented, 2);
});

test("非开发模式不绑定 DevTools 快捷键，窗口创建时按开发地址启用", () => {
  const webContents = new EventEmitter();
  bindDevelopmentTools({ webContents }, false);
  assert.equal(webContents.listenerCount("before-input-event"), 0);
  assert.match(readFileSync("src/main.ts", "utf8"), /bindDevelopmentTools\(mainWindow, Boolean\(MAIN_WINDOW_VITE_DEV_SERVER_URL\)\)/);
});

test("同列前后排序保留状态、元数据和唯一任务", () => {
  const tasks = [first, second, third];
  const reordered = moveTask(tasks, first.id, "TODO");
  assert.deepEqual(reordered, [second, first, third]);
  assert.deepEqual(moveTask(reordered, first.id, "TODO", second.id), tasks);
  assert.equal(new Set(reordered.map((task) => task.id)).size, tasks.length);
  assert.equal(first.status, "TODO");
});

test("跨列插入指定位置、空列和归档后返回", () => {
  const tasks = [first, second, third];
  const moved = moveTask(tasks, first.id, "DONE", third.id);
  assert.deepEqual(moved, [second, { ...first, status: "DONE" }, third]);
  const archived = moveTask(moved, first.id, "ARCHIVED");
  assert.deepEqual(archived.at(-1), { ...first, status: "ARCHIVED", archivedFrom: "DONE" });
  assert.deepEqual(moveTask(archived, first.id, "TODO", second.id), tasks);
});

test("同位置、未知任务、自插入、错误目标均不改变数据", () => {
  const tasks = [first, second, third];
  assert.equal(moveTask(tasks, first.id, "TODO", second.id), tasks);
  assert.equal(moveTask(tasks, first.id, "TODO", first.id), tasks);
  assert.equal(moveTask(tasks, "unknown", "DONE"), tasks);
  assert.equal(moveTask(tasks, first.id, "DONE", second.id), tasks);
});

test("导航历史支持前进后退，切换模块会丢弃无效前进历史", () => {
  const initial = { entries: ["tasks"], index: 0 };
  assert.equal(stepNavigation(initial, -1), initial);
  const visited = navigateTo(navigateTo(initial, "issue"), "settings");
  const previous = stepNavigation(visited, -1);
  assert.equal(previous.entries[previous.index], "issue");
  assert.equal(stepNavigation(previous, 1).entries.at(-1), "settings");
  assert.deepEqual(navigateTo(previous, "tasks"), { entries: ["tasks", "issue", "tasks"], index: 2 });
  assert.equal(navigateTo(initial, "tasks"), initial);
});

test("任务存储区分首次使用和已保存的空列表", () => {
  assert.equal(parseStoredItems(null, isTask), null);
  assert.deepEqual(parseStoredItems("[]", isTask), []);
  assert.deepEqual(parseStoredItems(JSON.stringify([first]), isTask), [first]);
});

test("损坏、非法状态和重复 id 不进入看板", () => {
  for (const raw of ["bad json", "{}", JSON.stringify([first, first]), JSON.stringify([{ ...first, status: "BAD" }]), JSON.stringify([{ ...first, date: "not-a-date" }])]) {
    assert.deepEqual(parseStoredItems(raw, isTask), []);
  }
});

test("Issue 存储接受合法分组、标签与状态，拒绝无效内容", () => {
  const issue = { ...first, group: "PR", tag: "feature", status: "review" };
  assert.equal(isIssueItem(issue), true);
  assert.equal(isIssueItem({ ...issue, group: "TASK" }), false);
  assert.equal(isIssueItem({ ...issue, tag: "unknown" }), false);
  assert.equal(isIssueItem({ ...issue, status: "TODO" }), false);
  assert.deepEqual(parseStoredItems(JSON.stringify([issue]), isIssueItem), [issue]);
});

test("任务筛选同类条件取并集，不同条件取交集，并保留原顺序", () => {
  const taskWithProject = { ...third, title: "接入 Agent", projectName: "other" };
  const tasks = [first, second, taskWithProject];
  assert.deepEqual(filterTasks(tasks, { statuses: [], projects: [] }), tasks);
  assert.deepEqual(filterTasks(tasks, { statuses: ["TODO", "DONE"], projects: ["navo"] }), [first, second]);
  assert.deepEqual(filterTasks(tasks, { statuses: ["DONE"], projects: ["other", "navo"] }), [taskWithProject]);
  assert.deepEqual(filterTasks(tasks, { statuses: ["TODO"], projects: ["other"] }), []);
  assert.deepEqual(filterTasks(tasks, { statuses: [], projects: ["missing"] }), []);
});

test("日期排序只改变显示，日期相同时保留自定义顺序", () => {
  const older = { ...third, date: "2026-09-28" };
  const tasks = [first, older, second];
  assert.equal(orderTasks(tasks, "manual"), tasks);
  assert.deepEqual(orderTasks(tasks, "newest"), [first, second, older]);
  assert.deepEqual(orderTasks(tasks, "oldest"), [older, first, second]);
  assert.deepEqual(tasks, [first, older, second]);
});

test("筛选看板重排不会删除隐藏任务或更改隐藏任务的相对顺序", () => {
  const hidden = { ...first, id: "hidden", projectName: "other" };
  const anotherHidden = { ...hidden, id: "another-hidden" };
  const tasks = [first, hidden, second, anotherHidden, third];
  const visible = filterTasks(tasks, { statuses: [], projects: ["navo"] });
  const reordered = moveTask(tasks, second.id, "TODO", visible[0].id);
  assert.deepEqual(filterTasks(reordered, { statuses: ["TODO"], projects: ["navo"] }), [second, first]);
  assert.deepEqual(reordered.filter((task) => task.projectName === "other"), [hidden, anotherHidden]);
  assert.equal(reordered.length, tasks.length);
});

test("Issue 多维筛选同类取并集、不同条件取交集且保留原始条目", () => {
  const pullRequest = { ...first, group: "PR", tag: "feature", status: "review" };
  const issue = { ...second, group: "ISSUE", tag: "fix", status: "todo", projectName: "other" };
  const anotherIssue = { ...third, group: "ISSUE", tag: "feature", status: "progress" };
  const issues = [pullRequest, issue, anotherIssue];
  const filters = { groups: [], statuses: [], projects: [], tags: [] };
  assert.deepEqual(filterIssues(issues, filters), issues);
  assert.deepEqual(filterIssues(issues, { ...filters, groups: ["PR", "ISSUE"], tags: ["feature"] }), [pullRequest, anotherIssue]);
  assert.deepEqual(filterIssues(issues, { ...filters, groups: ["ISSUE"], statuses: ["todo", "progress"], projects: ["other"], tags: ["fix", "feature"] }), [issue]);
  assert.deepEqual(filterIssues(issues, { ...filters, groups: ["PR"], statuses: ["todo"] }), []);
  assert.deepEqual(filterIssues(issues, { ...filters, projects: ["missing"] }), []);
  assert.deepEqual(filterIssues([], filters), []);
  assert.deepEqual(issues, [pullRequest, issue, anotherIssue]);
});

test("Issue 时间排序稳定且不修改原始顺序或条目元信息", () => {
  const newest = { ...first, group: "PR", tag: "feature", status: "review" };
  const older = { ...second, group: "ISSUE", tag: "fix", status: "todo", date: "2026-09-28" };
  const sameDate = { ...newest, id: "same-date" };
  const issues = [newest, older, sameDate];
  assert.equal(orderIssues(issues, "default"), issues);
  assert.deepEqual(orderIssues(issues, "newest"), [newest, sameDate, older]);
  assert.deepEqual(orderIssues(issues, "oldest"), [older, newest, sameDate]);
  assert.equal(orderIssues(issues, "newest")[0], newest);
  assert.deepEqual(issues, [newest, older, sameDate]);
  assert.deepEqual(orderIssues([], "oldest"), []);
});
