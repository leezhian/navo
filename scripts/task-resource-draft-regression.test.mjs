import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const { createTaskResourceDraft, mergeTaskResourceDrafts } = createLoader()("src/domain/taskResourceDraft.ts");
const repository = { resourceId: "repo", name: "repo", path: "/repo", git: { root: "/repo", currentBranch: "main", defaultSource: "refs/remotes/origin/main", branches: [] } };

test("目录初始配置遵循默认模式及实际 Git 能力", () => {
  for (const mode of ["worktree", "new-branch", "current-branch"]) {
    const draft = createTaskResourceDraft(repository, mode);
    assert.equal(draft.mode, mode);
    assert.equal(draft.sourceBranch, mode === "current-branch" ? "refs/heads/main" : "refs/remotes/origin/main");
    assert.equal(draft.targetBranch, "");
  }
  const folder = createTaskResourceDraft({ ...repository, git: null }, "worktree");
  assert.equal(folder.mode, "folder");
  assert.equal(folder.sourceBranch, "");
  assert.equal(createTaskResourceDraft({ ...repository, git: { ...repository.git, currentBranch: "" } }, "current-branch").sourceBranch, "HEAD");
});

test("确认选择保留已编辑的源分支与隔离配置", () => {
  const selected = { ...createTaskResourceDraft(repository, "worktree"), mode: "new-branch", sourceBranch: "refs/heads/main" };
  assert.deepEqual(mergeTaskResourceDrafts([], [selected]), [selected]);
  assert.deepEqual(mergeTaskResourceDrafts([createTaskResourceDraft(repository, "worktree")], [selected], "repo"), [selected]);
});

test("不同资源记录指向相同 Git 根目录时仍禁止重复关联", () => {
  const current = createTaskResourceDraft(repository, "worktree");
  const duplicate = createTaskResourceDraft({ ...repository, resourceId: "alias", path: "/repo/subfolder" }, "new-branch");
  assert.throws(() => mergeTaskResourceDrafts([current], [duplicate]), /TASK_DUPLICATE_RESOURCE/);
  assert.throws(() => mergeTaskResourceDrafts([], [current, duplicate]), /TASK_DUPLICATE_RESOURCE/);
});
