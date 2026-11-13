import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

test("自动分支遇到已有目录或本批次重名时同时更换分支和目录后缀", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-worktree-path-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "repo-12345678"));
  const branches = ["navo/navo-task-a1b2c3d4", "navo/navo-task-e5f60718"];
  const { assignWorktreePath } = createLoader({ "./taskGit": { generateTaskBranch: async () => branches.shift() } })
    ("src/main-process/services/taskWorktreePath.ts");
  const step = { automaticTarget: true, branchPrefix: "navo/", repository: root, resource: { name: "repo", targetBranch: "navo/navo-task-12345678" } };
  await assignWorktreePath(step, root, [path.join(root, "repo-a1b2c3d4")]);
  assert.equal(step.resource.targetBranch, "navo/navo-task-e5f60718");
  assert.equal(step.resource.workingPath, path.join(root, "repo-e5f60718"));
  await access(path.join(root, "repo-12345678"));
});

test("手动和已有分支另取短 ID，重名只重试目录且项目名不会越界", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-worktree-path-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "-repo-12345678"));
  const ids = ["12345678", "abcdef12", "abcdef34"];
  const { assignWorktreePath } = createLoader({
    "node:crypto": { randomBytes: () => Buffer.from(ids.shift(), "hex") },
    "./taskGit": { generateTaskBranch: async () => { throw new Error("manual branch must not change"); } },
  })("src/main-process/services/taskWorktreePath.ts");
  for (const useExistingBranch of [false, true]) {
    const step = { automaticTarget: useExistingBranch, branchPrefix: "navo/", repository: root,
      resource: { name: "../repo", targetBranch: "feat/login", useExistingBranch } };
    await assignWorktreePath(step, root);
    assert.equal(step.resource.targetBranch, "feat/login");
    assert.equal(path.dirname(step.resource.workingPath), root);
    assert.equal(path.basename(step.resource.workingPath), useExistingBranch ? "-repo-abcdef34" : "-repo-abcdef12");
  }
});
