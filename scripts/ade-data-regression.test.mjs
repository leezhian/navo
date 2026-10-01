import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

async function importTs(file) {
  const source = readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { moveTask } = await importTs("src/utils/taskState.ts");
const { navigateTo, stepNavigation } = await importTs("src/domain/navigation.ts");
const { isTask, isIssueItem, parseStoredItems } = await importTs("src/utils/adeDataValidation.ts");
const { filterTasks, orderTasks } = await importTs("src/utils/taskView.ts");
const { filterIssues, orderIssues } = await importTs("src/utils/issueView.ts");
const first = { id: "first", title: "任务一", date: "2026-09-30", projectName: "navo", status: "TODO" };
const second = { ...first, id: "second", title: "任务二" };
const third = { ...first, id: "third", status: "DONE" };

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
  assert.deepEqual(archived.at(-1), { ...first, status: "ARCHIVED" });
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
