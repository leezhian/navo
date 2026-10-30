import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, stat, realpath, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
const { TaskInitializationRepository, planWorktreeInitialization } = load("src/main-process/services/taskInitializationRepository.ts");
const { TaskInitializationService } = load("src/main-process/services/taskInitializationService.ts");

test("Only freshly created worktrees receive a snapshot of enabled commands", () => {
  const resource = { resourceId: "workspace", repositoryId: "repo", mode: "worktree" };
  const command = { id: "install", name: "Install", script: "printf original", runOnWorktreeCreation: true };
  const plan = planWorktreeInitialization([{ resource, worktreeCreated: true }, { resource, worktreeCreated: false }, { resource, worktreeCreated: true, reused: true }, { resource: { ...resource, mode: "new-branch" }, worktreeCreated: true }], [{ id: "repo", commands: [command, { ...command, runOnWorktreeCreation: false }] }]);
  assert.equal(plan.length, 1); assert.equal(plan[0].resourceId, "workspace");
  command.script = "changed later"; assert.equal(plan[0].script, "printf original");
});

test("Initialization runs sequential real shell scripts, retains failure, retries only unfinished steps and recovers interruptions", async context => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "navo-init-test-")));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db");
  const info = await stat(directory);
  const task = { id: "task", title: "Task", description: "Prompt", status: "TODO", date: "2026-10-01", updatedAt: "2026-10-01", projectName: "repo",
    resources: [{ resourceId: "workspace", name: "repo", mode: "worktree", workingPath: directory, originalPath: directory, targetBranch: "feature", ownership: { path: directory, directoryId: `${info.dev}:${info.ino}` } }] };
  const steps = [
    { id: "first", resourceId: "workspace", name: "First", script: "printf first >> order.txt", status: "pending" },
    { id: "second", resourceId: "workspace", name: "Second", script: "if [ ! -f retried ]; then touch retried; exit 7; fi; printf second >> order.txt", status: "pending" },
    { id: "third", resourceId: "workspace", name: "Third", script: "printf third >> order.txt", status: "pending" },
  ];
  const tasks = new TaskRepository(filename, "test"); await tasks.create(task, [], steps);
  const repository = new TaskInitializationRepository(filename, "test");
  const executions = [], children = new Set(); let concurrent = 0;
  const sessions = {
    async start(input, owner, initial, execution) {
      assert.equal(concurrent, 0); concurrent++; executions.push(execution.command.id);
      const child = spawn("/bin/sh", ["-c", execution.command.script], { cwd: directory }); children.add(child);
      child.once("exit", code => { concurrent--; children.delete(child); execution.finished(code); });
    },
    async stopInitialization() { for (const child of children) child.kill(); },
  };
  const service = new TaskInitializationService(repository, sessions, async () => (await tasks.load())[0], () => {});
  context.after(() => service.shutdown());
  const owner = { isDestroyed: () => false };
  assert.equal(await service.run("task", owner), false);
  assert.deepEqual(executions, ["first", "second"]); assert.equal(await readFile(path.join(directory, "order.txt"), "utf8"), "first");
  assert.deepEqual((await repository.list("task")).map(step => step.status), ["succeeded", "failed", "pending"]);
  assert.equal(await service.run("task", owner), false); assert.equal(executions.length, 2);
  assert.equal(await service.run("task", owner, true), true);
  assert.deepEqual(executions, ["first", "second", "second", "third"]);
  assert.equal(await readFile(path.join(directory, "order.txt"), "utf8"), "firstsecondthird");
  const records = await repository.list("task"); records[1].status = "running"; await repository.save("task", records[1]);
  await repository.recover();
  assert.equal((await repository.list("task"))[1].status, "failed");
  assert.equal(await service.run("task", owner), false); assert.equal(executions.length, 4);
  assert.equal((await tasks.load())[0].resources.length, 1);
  assert.ok(!(await tasks.load())[0].initialization.some(step => "script" in step));
});
