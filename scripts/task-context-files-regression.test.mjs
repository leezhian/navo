import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, stat, rename, symlink, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskContextFiles } = load("src/main-process/services/taskSessions/taskContextFiles.ts");
const base = { id: "task-one", title: "Task", description: "original", contextVersion: 1, status: "TODO", notes: [{ id: "note", title: "Rules", content: "first" }],
  resources: [{ resourceId: "one", name: "Repo", workingPath: "/repo-one", sourceBranch: "main", targetBranch: "topic" }],
  attachments: [{ id: "file", name: "reference.txt" }] };
const filename = instructions => JSON.parse(instructions.split("\n")[1]);
const read = async location => JSON.parse(await readFile(location, "utf8"));
async function fixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-live-context-"));
  const files = new TaskContextFiles();
  context.after(async () => { await files.close(); await rm(root, { recursive: true, force: true }); });
  return { root, files };
}

test("Live files update full task state, remove unlinked items and isolate task/session data", async context => {
  const { root, files } = await fixture(context);
  const first = filename(await files.prepare("session-one", base, root, ["/attachments/ref.txt"]));
  const second = filename(await files.prepare("session-two", base, root, ["/attachments/ref.txt"]));
  const other = filename(await files.prepare("session-other", { ...base, id: "task-two", description: "other task" }, root, []));
  assert.notEqual(first, second); assert.notEqual(path.dirname(first), path.dirname(other));
  assert.equal((await read(first)).attachments[0].path, "/attachments/ref.txt");
  assert.equal((await stat(first)).mode & 0o777, 0o400);
  const updated = { ...base, contextVersion: 2, description: "latest", promptVersion: 3, promptComments: [{ id: "comment", body: "Review prompt" }], notes: [], resources: [], attachments: [] };
  await files.update("session-one", updated, []); await files.update("session-two", updated, []);
  for (const location of [first, second]) {
    const value = await read(location);
    assert.equal(value.version, 2); assert.equal(value.task.prompt, "latest");
    assert.equal(value.task.promptNoteId, "task-prompt"); assert.equal(value.task.promptVersion, 3); assert.deepEqual(value.task.promptComments, updated.promptComments);
    assert.deepEqual(value.notes, []); assert.deepEqual(value.workspaces, []); assert.deepEqual(value.attachments, []);
  }
  assert.equal((await read(other)).task.prompt, "other task");
  await assert.rejects(files.update("session-one", { ...updated, id: "task-two" }, []), /UNAVAILABLE/);
  const before = (await stat(first)).ino;
  await files.update("session-one", updated, []);
  assert.equal((await stat(first)).ino, before, "Unchanged versions do not rewrite files");
  await files.release("session-one"); await assert.rejects(readFile(first), { code: "ENOENT" });
  assert.equal((await read(second)).task.prompt, "latest");
  assert.ok((await readdir(path.dirname(second))).every(name => !name.endsWith(".tmp")));
});

test("Archive removes resource bodies, restore refreshes the same live file, restart rotates its path", async context => {
  const { root, files } = await fixture(context);
  const first = filename(await files.prepare("session", base, root, []));
  await files.update("session", { ...base, status: "ARCHIVED" }, []);
  const archived = await read(first);
  assert.equal(archived.unavailable, true); assert.equal(archived.notes, undefined); assert.equal(archived.task.prompt, undefined);
  await files.update("session", base, []); assert.equal((await read(first)).notes[0].content, "first");
  const moved = path.join(root, "changed-setting");
  const next = filename(await files.prepare("session", { ...base, description: "resumed" }, moved, []));
  assert.notEqual(first, next); await assert.rejects(readFile(first), { code: "ENOENT" });
  assert.equal((await read(next)).task.prompt, "resumed");
  await files.close(); await assert.rejects(readFile(next), { code: "ENOENT" });
});

test("Replaced files/directories and symlinked task folders never redirect writes or cleanup outside Navo", async context => {
  const { root, files } = await fixture(context);
  await assert.rejects(files.prepare("session", { ...base, id: "../outside" }, root, []), /INVALID/);
  const outside = path.join(root, "external"); await mkdir(outside); const original = path.join(outside, "original.json"); await writeFile(original, "external content");
  const linkRoot = path.join(root, "linked"); await mkdir(linkRoot); await symlink(outside, path.join(linkRoot, base.id));
  await assert.rejects(files.prepare("linked-session", base, linkRoot, []), /CHANGED/);
  const first = filename(await files.prepare("file-session", base, root, []));
  await rm(first); await symlink(original, first);
  await assert.rejects(files.update("file-session", { ...base, contextVersion: 2 }, [], true), /CHANGED/);
  await files.release("file-session"); assert.equal(await readFile(original, "utf8"), "external content");
  const second = filename(await files.prepare("dir-session", base, root, []));
  const directory = path.dirname(second); await rename(directory, directory + "-moved"); await symlink(outside, directory);
  await assert.rejects(files.update("dir-session", { ...base, contextVersion: 3 }, []), /CHANGED/);
  await files.release("dir-session"); assert.equal(await readFile(original, "utf8"), "external content");
});

test("Fallback launch passes file instructions via native CLI arguments, including Grok resume, without overriding stdin", async () => {
  const selection = { agentId: "grok", modelId: "model", modelName: "Model", modeId: "default", modeName: "Default" };
  let help = "--model --permission-mode --session-id --resume --rules --mode --prompt-interactive";
  const runtime = createLoader({
    "../agents/agentEnvironment": { agentShellEnvironment: async () => ({}), runAgentProbe: async () => ({ code: 0, stdout: help, stderr: "" }) },
    "../agents/agentDetection": { detectAgent: async () => ({ binaryPath: "/fake-cli", status: "installed", auth: "signedIn" }) },
    "../../../utils/taskAgentSelection": { matchesAgentCapabilities: () => true },
  });
  const { prepareAgentLaunch } = runtime("src/main-process/services/taskSessions/agentLaunch.ts");
  const agents = { repository: { read: async () => ({ configurations: ["grok", "antigravity"].map(id => ({ id, enabled: true, args: [] })) }), environment: () => ({}) }, capabilities: async () => ({}) };
  let copies = 0;
  const prepare = async () => { copies++; return "Read live file /safe/context.json before each message"; };
  const fresh = await prepareAgentLaunch(agents, selection, "native-id", "full snapshot", false, undefined, undefined, "task index", prepare);
  assert.equal(fresh.contextMode, "file"); assert.ok(fresh.args.includes("--rules")); assert.ok(fresh.args.at(-1).includes("task index"));
  const resumed = await prepareAgentLaunch(agents, selection, "native-id", "do not resend old task", true, undefined, undefined, "index", prepare);
  assert.deepEqual(resumed.args.slice(-2), ["--resume", "native-id"]); assert.ok(resumed.args.includes("--rules"));
  assert.ok(!resumed.args.includes("do not resend old task")); assert.equal(copies, 2);
  const agy = await prepareAgentLaunch(agents, { ...selection, agentId: "antigravity" }, "native-id", "snapshot", false, undefined, undefined, "index", prepare);
  assert.equal(agy.contextMode, "file"); assert.ok(agy.args[agy.args.indexOf("--prompt-interactive") + 1].includes("Read live file"));
  help = help.replace("--rules", "");
  const unsupportedResume = await prepareAgentLaunch(agents, selection, "native-id", "snapshot", true, undefined, undefined, "index", prepare);
  assert.equal(unsupportedResume.contextMode, "snapshot"); assert.equal(copies, 3, "Do not claim file integration when resume cannot receive the instructions");
});
