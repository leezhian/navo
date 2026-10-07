import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { resolveSessionWorkspace, sessionWorkspaceLabel } = load("src/utils/taskSessionWorkspace.ts");
const { prepareTaskContext } = load("src/main-process/services/taskSessions/taskContext.ts");
const { readLegacySessionWorkspace } = load("src/main-process/services/taskSessions/legacySessionWorkspace.ts");
const repo = { resourceId: "repo", name: "navo", mode: "worktree", workingPath: "/repo", sourceBranch: "main", targetBranch: "feature" };
const folder = { resourceId: "folder", name: "assets", mode: "folder", workingPath: "/assets", sourceBranch: "", targetBranch: "" };

test("目录选择：单目录默认，多目录默认全部，显式全部不退回单目录，无效 ID 拒绝", () => {
  assert.deepEqual(resolveSessionWorkspace([]), { kind: "all" });
  assert.equal(resolveSessionWorkspace([repo]).resourceId, "repo");
  assert.deepEqual(resolveSessionWorkspace([repo, folder]), { kind: "all" });
  assert.deepEqual(resolveSessionWorkspace([repo], null), { kind: "all" });
  assert.equal(resolveSessionWorkspace([repo, folder], "folder").name, "assets");
  for (const invalid of ["", "missing", false, 1, {}]) assert.throws(() => resolveSessionWorkspace([repo], invalid), /DIRECTORY_MISSING/);
});

test("会话分支回显：全局快照、资源快照、旧目录精确匹配，不按资源数量猜测", () => {
  const label = (session, resources = [repo, folder]) => sessionWorkspaceLabel(session, resources, "All worktrees and folders", "Unknown");
  assert.equal(label({ cwd: "/task", workspace: { kind: "all" } }, [repo]), "All worktrees and folders");
  const bound = { cwd: "/repo", workspace: resolveSessionWorkspace([repo]) };
  assert.equal(label(bound), "feature");
  assert.equal(label(bound, []), "feature");
  assert.equal(label({ cwd: "/repo/" }), "feature");
  assert.equal(label({ cwd: "/assets" }), "assets");
  assert.equal(label({ cwd: "/different" }), "different");
  assert.equal(label({ cwd: "" }), "Unknown");
});

test("真实目录准备与旧记录识别：单目录、指定目录及全局范围，不创建额外 worktree", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-session-scope-"));
  try {
    const repoPath = path.join(root, "repo");const folderPath = path.join(root, "assets");
    await mkdir(repoPath);await mkdir(folderPath);
    const resources = [{ ...repo, workingPath: repoPath }, { ...folder, workingPath: folderPath }];
    const task = { id: "task-scope", title: "Scope", resources };
    const taskRoot = path.join(root, "tasks");
    const selected = await prepareTaskContext(task, taskRoot, "repo");
    assert.equal(selected.cwd, await realpath(repoPath));
    assert.ok(selected.prompt.includes(folderPath));
    const all = await prepareTaskContext(task, taskRoot, null);
    assert.equal(all.cwd, path.join(await realpath(taskRoot), task.id));
    const single = { ...task, resources: [resources[0]] };
    assert.equal((await prepareTaskContext(single, taskRoot)).cwd, selected.cwd);
    assert.equal((await prepareTaskContext(single, taskRoot, null)).cwd, all.cwd);
    assert.deepEqual(await readLegacySessionWorkspace(single, all.cwd, taskRoot), { kind: "all" });
    assert.equal((await readLegacySessionWorkspace(task, selected.cwd, taskRoot)).resourceId, "repo");
    const alias = path.join(root, "alias");await symlink(repoPath, alias);
    assert.equal((await readLegacySessionWorkspace(task, alias, taskRoot)).resourceId, "repo");
    assert.equal(await readLegacySessionWorkspace(task, root, taskRoot), undefined);
    await rm(repoPath, { recursive: true });
    await assert.rejects(prepareTaskContext(single, taskRoot, "repo"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
