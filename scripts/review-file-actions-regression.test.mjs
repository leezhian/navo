import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import * as pierre from "@pierre/diffs";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader({ "@pierre/diffs": pierre });
const { parseGitDiff } = load("src/domain/diffParser.ts");
const { createDiffFileMap, toCodeViewItems } = load("src/components/review/diff-code-view/diffCodeViewItems.ts");
const { getVisibleFiles } = load("src/components/review/review-workspace/reviewWorkspaceUtils.ts");
const { getLineCommentId, parseLineCommentId } = load("src/components/review/diff-viewer/LineComment.tsx");
const { getReviewFilePaths } = load("src/utils/reviewFilePaths.ts");
const { loadBranches, runReviewFileAction, runReviewBatchFileAction } = load("src/main-process/services/gitReviewService.ts");
const execute = promisify(execFile);

test("相似路径和中文路径的选择、文件头操作及评论关联互不覆盖", () => {
  const paths = ["a/b.ts", "a-b.ts", "中文.ts", "文件.ts", "a:b.ts"];
  const patch = paths.map((name) => `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-old\n+new\n`).join("");
  const summary = parseGitDiff(patch);
  const filesById = createDiffFileMap(summary.files);
  const items = toCodeViewItems(summary.files, new Set(), new Map());
  assert.equal(summary.files.length, paths.length);
  assert.equal(filesById.size, paths.length);
  for (const [index, file] of summary.files.entries()) {
    assert.equal(getVisibleFiles(summary, "single-file", file.id)[0].displayPath, paths[index]);
    assert.equal(filesById.get(items[index].id).displayPath, paths[index]);
    const comment = parseLineCommentId(getLineCommentId(file.id, "additions", 1));
    assert.equal(filesById.get(comment.fileId).displayPath, paths[index]);
  }
});

async function repository(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-review-git-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const git = async (...args) => (await execute("git", args, {
    cwd: directory, env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1" },
  })).stdout;
  await git("init", "-b", "main");
  await git("config", "user.name", "Test");
  await git("config", "user.email", "test@example.invalid");
  await git("config", "core.hooksPath", os.devNull);
  await writeFile(path.join(directory, "old.txt"), "original\n");
  await writeFile(path.join(directory, "keep-staged.txt"), "initial\n");
  await writeFile(path.join(directory, "untouched.txt"), "initial\n");
  await git("add", ".");
  await git("commit", "-m", "initial");
  return { directory, git };
}

for (const action of ["unstage", "restore-file", "unstage-all"]) {
  test(`重命名文件 ${action} 同时处理新旧路径并保留无关修改`, async (context) => {
    const { directory, git } = await repository(context);
    await git("mv", "old.txt", "new.txt");
    await writeFile(path.join(directory, "keep-staged.txt"), "staged\n");
    await git("add", "keep-staged.txt");
    await writeFile(path.join(directory, "untouched.txt"), "keep working changes\n");
    const summary = parseGitDiff(await git("diff", "--cached"));
    const renamed = summary.files.find((file) => file.status === "renamed");
    assert.ok(renamed);
    if (action === "unstage-all") {
      await runReviewBatchFileAction({ projectPath: directory, action, filePaths: getReviewFilePaths(summary.files) });
      assert.equal(await git("diff", "--cached", "--name-only"), "");
    } else {
      await runReviewFileAction({ projectPath: directory, action, filePaths: getReviewFilePaths([renamed]) });
      assert.equal((await git("diff", "--cached", "--name-only")).trim(), "keep-staged.txt");
    }
    assert.equal(await readFile(path.join(directory, "untouched.txt"), "utf8"), "keep working changes\n");
    if (action === "restore-file") {
      assert.equal(await readFile(path.join(directory, "old.txt"), "utf8"), "original\n");
      await assert.rejects(readFile(path.join(directory, "new.txt")), { code: "ENOENT" });
    } else {
      assert.equal(await readFile(path.join(directory, "new.txt"), "utf8"), "original\n");
      await assert.rejects(readFile(path.join(directory, "old.txt")), { code: "ENOENT" });
    }
  });
}

test("对比分支包含远端跟踪引用，排除远端 HEAD，重名引用仍可解析", async (context) => {
  const { directory, git } = await repository(context);
  await git("update-ref", "refs/remotes/origin/release", "HEAD");
  await git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/release");
  assert.deepEqual(await loadBranches(directory), ["main", "origin/release"]);
  await git("branch", "origin/release");
  const branches = await loadBranches(directory);
  assert.equal(branches.length, 3);
  assert.equal(new Set(branches).size, 3);
  for (const branch of branches) assert.equal((await git("rev-parse", "--verify", `${branch}^{commit}`)).trim(), (await git("rev-parse", "HEAD")).trim());
});
