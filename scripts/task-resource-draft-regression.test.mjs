import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const { createTaskResourceDraft, mergeTaskResourceDrafts } = createLoader()("src/domain/taskResourceDraft.ts");
const { taskResourceNotice } = createLoader()("src/utils/taskResourceNotice.ts");
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

test("已关联提示区分仓库和具体分支，绑定 ID 不冒充全局 Repo ID", () => {
  const attached = [{ resourceId: "workspace-id", repositoryId: "repo", mode: "worktree", sourceBranch: "main", targetBranch: "feature" }];
  const draft = createTaskResourceDraft(repository, "worktree");
  assert.equal(taskResourceNotice("repo", draft, attached), "repo");
  assert.equal(taskResourceNotice("repo", { ...draft, useExistingBranch: true, sourceBranch: "refs/heads/feature" }, attached), "branch");
  assert.equal(taskResourceNotice("workspace-id", draft, attached), undefined);
});

test("确认选择保留已编辑的源分支与隔离配置", () => {
  const selected = { ...createTaskResourceDraft(repository, "worktree"), mode: "new-branch", sourceBranch: "refs/heads/main" };
  assert.deepEqual(mergeTaskResourceDrafts([], [selected]), [selected]);
  const current = createTaskResourceDraft(repository, "worktree");
  assert.deepEqual(mergeTaskResourceDrafts([current], [selected], current.draftId), [selected]);
});

test("同仓库独立 Worktree 可重复配置，原目录和已有分支按工作区合并", () => {
  const current = createTaskResourceDraft(repository, "worktree");
  const duplicate = createTaskResourceDraft(repository, "worktree");
  assert.notEqual(current.draftId, duplicate.draftId);
  assert.equal(mergeTaskResourceDrafts([current], [duplicate]).length, 2);
  const direct = createTaskResourceDraft(repository, "current-branch");
  const alias = createTaskResourceDraft({ ...repository, resourceId: "alias", path: "/repo/subfolder" }, "new-branch");
  assert.deepEqual(mergeTaskResourceDrafts([direct], [alias]), [alias]);
  const branch = { ...current, useExistingBranch: true, sourceBranch: "refs/heads/feature" };
  assert.equal(mergeTaskResourceDrafts([branch], [{ ...branch, draftId: duplicate.draftId }]).length, 1);
});
