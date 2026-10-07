import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { createLoader } from "./helpers/load-typescript.mjs";

const execute = promisify(execFile);
const load = createLoader();
const { ResourceService } = load("src/main-process/services/resourceService.ts");
const { inspectResourceGit } = load("src/main-process/services/resourceGitInfo.ts");
const { normalizeResourceCommands, normalizeResourceDescription } = load("src/utils/resourceConfiguration.ts");

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-resource-config-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const folder = path.join(directory, "repo"); await mkdir(folder);
  const storage = path.join(directory, "resources.json");
  return { directory, folder, storage, service: new ResourceService(storage) };
}

test("资源描述和命令持久化；自动运行仅保存标记，编辑取消及旧客户端更新不丢字段", async (context) => {
  const { folder, storage, service } = await fixture(context);
  const script = 'printf "hello"\necho should-not-run > sentinel.txt\n';
  const command = { id: "install", name: " install ", script, runOnWorktreeCreation: true };
  const record = await service.save({ kind: "folder", name: "repo", localPath: folder, description: "  Repo description  ", commands: [command] });
  assert.equal(record.description, "Repo description");
  assert.equal(record.commands[0].script, script);
  assert.equal(record.commands[0].name, "install");
  assert.equal(record.commands[0].runOnWorktreeCreation, true);
  await assert.rejects(access(path.join(folder, "sentinel.txt")), /ENOENT/);
  const snapshot = (await new ResourceService(storage).list())[0];
  snapshot.commands[0].script = "unsaved";
  assert.equal((await service.list())[0].commands[0].script, script);
  const updated = await service.save({ id: record.id, kind: "folder", name: "renamed", localPath: folder });
  assert.equal(updated.description, "Repo description"); assert.equal(updated.commands[0].script, script);
  await service.save({ ...updated, description: "", commands: [] });
  assert.equal((await service.list())[0].description, ""); assert.deepEqual((await service.list())[0].commands, []);
});

test("旧资源缺少描述和命令时读取为空；损坏字段不被静默覆盖", async (context) => {
  const { storage, folder, service } = await fixture(context);
  const legacy = { id: "old", kind: "repo", name: "old", localPath: folder, available: true };
  await writeFile(storage, JSON.stringify([legacy]));
  assert.equal((await service.list())[0].description, ""); assert.deepEqual((await service.list())[0].commands, []);
  const malformed = JSON.stringify([{ ...legacy, commands: [{ id: "bad", name: "bad", script: "echo hi", runOnWorktreeCreation: "true" }] }]);
  await writeFile(storage, malformed);
  await assert.rejects(service.list(), /INVALID_RESOURCE_STORAGE/);
  await assert.rejects(service.save({ ...legacy, description: "update" }), /INVALID_RESOURCE_STORAGE/);
  assert.equal(await readFile(storage, "utf8"), malformed);
});

test("命令校验拒绝空白、重复 ID、超限及空字符，允许原样多行脚本", () => {
  const command = { id: "test", name: "Test", script: "echo hello\nprintf done", runOnWorktreeCreation: false };
  assert.deepEqual(normalizeResourceCommands([command]), [command]);
  for (const invalid of [null, {}, [command, command], [{ ...command, name: " " }], [{ ...command, script: "\n" }], [{ ...command, script: "bad\0script" }], [{ ...command, name: "bad\nname" }], [{ ...command, runOnWorktreeCreation: 1 }], [{ ...command, script: "a".repeat(20001) }], Array.from({ length: 51 }, (_, index) => ({ ...command, id: String(index) }))]) {
    assert.throws(() => normalizeResourceCommands(invalid), /INVALID_RESOURCE_COMMAND/);
  }
  assert.throws(() => normalizeResourceDescription("a".repeat(4001)), /INVALID_RESOURCE_DESCRIPTION/);
  assert.throws(() => normalizeResourceDescription(null), /INVALID_RESOURCE_DESCRIPTION/);
});

test("远程地址来自实际 Git：识别手动导入仓库，origin 优先，回退其他 remote，无远端及普通文件夹明确区分", async (context) => {
  const { folder, directory } = await fixture(context);
  assert.deepEqual(await inspectResourceGit(folder), { isRepository: false, remoteUrl: null });
  await execute("git", ["init", "--quiet", folder]);
  assert.deepEqual(await inspectResourceGit(folder), { isRepository: true, remoteUrl: null });
  await execute("git", ["-C", folder, "remote", "add", "upstream", "git@gitlab.example.com:team/repo.git"]);
  assert.equal((await inspectResourceGit(folder)).remoteUrl, "git@gitlab.example.com:team/repo.git");
  await execute("git", ["-C", folder, "remote", "add", "origin", "https://user:PRIVATE@github.com/team/repo.git?token=PRIVATE#PRIVATE"]);
  assert.equal((await inspectResourceGit(folder)).remoteUrl, "https://github.com/team/repo.git");
  await execute("git", ["-C", folder, "remote", "set-url", "origin", "ssh://git@gitlab.example.com/group/new.git"]);
  assert.equal((await inspectResourceGit(folder)).remoteUrl, "ssh://git@gitlab.example.com/group/new.git");
  await assert.rejects(inspectResourceGit("relative/path"), /INVALID_DIRECTORY/);
  await assert.rejects(inspectResourceGit(path.join(directory, "missing")), /ENOENT/);
});

test("修改资源路径不沿用旧仓库的远程地址，也不改磁盘 Git remote", async (context) => {
  const { service, folder, directory } = await fixture(context);
  await execute("git", ["init", "--quiet", folder]);
  await execute("git", ["-C", folder, "remote", "add", "origin", "git@example.com:team/repo.git"]);
  const record = await service.save({ kind: "repo", name: "repo", localPath: folder }, "git@example.com:team/repo.git");
  const second = path.join(directory, "other"); await mkdir(second);
  const saved = await service.save({ ...record, localPath: second, description: "Other", commands: [] });
  assert.equal(saved.remoteUrl, undefined);
  assert.equal((await inspectResourceGit(folder)).remoteUrl, "git@example.com:team/repo.git");
});
