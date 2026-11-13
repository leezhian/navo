import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink, realpath, chmod } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import path from "node:path";
import os from "node:os";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { detectResourceCommands } = load("src/main-process/services/commandDetection/detectResourceCommands.ts");
const { ResourceService } = load("src/main-process/services/resourceService.ts");
const { mergeDetectedCommands, normalizeCommandDetection } = load("src/utils/resourceCommandDetection.ts");
const execute = promisify(execFile);
async function fixture(context) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "navo-command-detection-")));
  context.after(() => rm(directory, { recursive: true, force: true }));
  async function put(relative, data) {
    const filename = path.join(directory, relative); await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, typeof data === "string" ? data : JSON.stringify(data)); return filename;
  }
  return { directory, put, service: new ResourceService(path.join(directory, "resources.json")) };
}

test("Node uses declared package manager before locks; locks select npm/pnpm/yarn/bun without running project code", async context => {
  const { directory, put, service } = await fixture(context);
  const manifest = { packageManager: "pnpm@10.0.0", scripts: { dev: "touch should-never-run", test: "echo tests" } };
  await put("package.json", manifest); await put("yarn.lock", "");
  let detected = await detectResourceCommands(directory);
  assert.deepEqual(detected.commands.map(command => command.script), ["pnpm run dev", "pnpm run test"]);
  assert.equal("suggestions" in detected, false);
  assert.ok(detected.commands.every(command => command.runOnWorktreeCreation === false));
  const saved = await service.save({ kind: "folder", name: "repo", localPath: directory });
  assert.equal(saved.commands.length, 2); assert.equal("suggestions" in saved.commandDetection, false);
  await assert.rejects(access(path.join(directory, "should-never-run")), { code: "ENOENT" });
  await put("package.json", { scripts: { dev: "echo dev" } });
  detected = await detectResourceCommands(directory); assert.equal(detected.commands[0].script, "yarn run dev");
  await rm(path.join(directory, "yarn.lock"));
  for (const [filename, manager] of [["pnpm-lock.yaml", "pnpm"], ["bun.lockb", "bun"], ["package-lock.json", "npm"], ["npm-shrinkwrap.json", "npm"]]) {
    await put(filename, ""); detected = await detectResourceCommands(directory);
    assert.equal(detected.commands[0].script, `${manager} run dev`);
    assert.equal(detected.commands.length, 1, "Lock files must not generate install commands");
    await rm(path.join(directory, filename));
  }
  await put("pnpm-lock.yaml", ""); await put("yarn.lock", "");
  detected = await detectResourceCommands(directory); assert.deepEqual(detected.commands, []);
  assert.ok(detected.warnings.some(warning => warning.code === "ambiguousManager"));
});

test("Node workspaces use their relative cwd and safely quote names; dependencies and escaping symlinks are ignored", async context => {
  const { directory, put } = await fixture(context);
  const workspace = "packages/web app's";
  const maliciousName = "dev;touch INJECTED";
  await put("package.json", { packageManager: "npm@11.0.0", workspaces: ["packages/*", "!packages/excluded", "node_modules/*"], scripts: {} });
  await put(`${workspace}/package.json`, { scripts: { [maliciousName]: "touch PROJECT_SCRIPT", "-bad": "bad" } });
  await put("packages/excluded/package.json", { scripts: { skip: "bad" } });
  await put("node_modules/ignored/package.json", { scripts: { skip: "bad" } });
  const external = await put("outside/package.json", { scripts: { external: "bad" } });
  await symlink(path.dirname(external), path.join(directory, "packages/linked"));
  const result = await detectResourceCommands(directory);
  assert.equal(result.commands.length, 1); assert.match(result.commands[0].name, /packages\/web/);
  const bin = path.join(directory, "bin"); await mkdir(bin);
  const npm = await put("bin/npm", '#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE"\npwd > "$CWD_CAPTURE"\n'); await chmod(npm, 0o755);
  const capture = path.join(directory, "args.txt"), cwdCapture = path.join(directory, "cwd.txt");
  await execute("/bin/sh", ["-c", result.commands[0].script], { cwd: directory, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, CAPTURE: capture, CWD_CAPTURE: cwdCapture } });
  assert.equal(await readFile(capture, "utf8"), `run\n${maliciousName}\n`);
  assert.equal((await readFile(cwdCapture, "utf8")).trim(), path.join(directory, workspace));
  await assert.rejects(access(path.join(directory, workspace, "INJECTED")), { code: "ENOENT" });
  await assert.rejects(access(path.join(directory, workspace, "PROJECT_SCRIPT")), { code: "ENOENT" });
});

test("pnpm package lists, object workspaces, incomplete manifests and scan limits have explicit results", async context => {
  const { directory, put } = await fixture(context);
  await put("package.json", { packageManager: "pnpm@10.1.0", workspaces: { packages: ["apps/*"] } });
  await put("pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n  - '!packages/skip'\n");
  await put("packages/one/package.json", { scripts: { build: "build" } });
  await put("packages/skip/package.json", { scripts: { skip: "skip" } });
  await put("apps/site/package.json", { scripts: { start: "start" } });
  let result = await detectResourceCommands(directory);
  assert.deepEqual(result.commands.map(command => command.script), ["cd -- apps/site && pnpm run start", "cd -- packages/one && pnpm run build"]);
  await rm(path.join(directory,"package.json")); result = await detectResourceCommands(directory);
  assert.equal(result.commands[0].script, "cd -- packages/one && pnpm run build", "Rootless pnpm workspaces still use the root package manager");
  await put("package.json", "{bad"); result = await detectResourceCommands(directory);
  assert.ok(result.warnings.some(warning => warning.source === "package.json" && warning.code === "invalidManifest"));
  await put("package.json", { scripts: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`script-${i}`, "echo ok"])) });
  result = await detectResourceCommands(directory); assert.equal(result.commands.length, 50); assert.ok(result.warnings.some(warning => warning.code === "limitReached"));
  await put("package.json", "x".repeat(1024 * 1024 + 1)); result = await detectResourceCommands(directory);
  assert.ok(result.warnings.some(warning => warning.source === "package.json" && warning.code === "unreadable"));
});

test("Non-Node projects do not produce detected or suggested commands", async context => {
  const { directory, put } = await fixture(context);
  await put("pyproject.toml", '[project]'); await put("uv.lock", ""); await put("requirements.txt", "pytest");
  await put("Cargo.toml", '[workspace]');
  const result = await detectResourceCommands(directory);
  assert.deepEqual(result.commands, []); assert.equal("suggestions" in result, false);
});

test("Rescan is read-only; merging preserves edited commands and limits; failures do not prevent adding a folder", async context => {
  const { directory, put, service } = await fixture(context);
  await put("package.json", { scripts: { dev: "dev", build: "build" } });
  const saved = await service.save({ kind: "repo", name: "repo", localPath: directory });
  const edited = { ...saved.commands[0], name: "Custom", script: "echo custom", runOnWorktreeCreation: true };
  await service.save({ ...saved, commands: [edited] });
  await put("package.json", { packageManager: "pnpm@10.0.0", scripts: { dev: "new", test: "new test" } });
  const detection = await service.detectCommands(directory);
  assert.deepEqual((await service.list())[0].commands, [edited], "Rescan does not persist its draft");
  const merged = mergeDetectedCommands([edited], detection.commands);
  assert.deepEqual(merged.commands[0], edited); assert.equal(merged.commands.length, 2); assert.equal(merged.commands[1].script, "pnpm run test");
  assert.equal(mergeDetectedCommands(merged.commands, detection.commands).commands.length, 2);
  await service.save({ ...saved, commands: merged.commands, commandDetection: detection });
  assert.equal((await service.list())[0].commandDetection.commands[1].script, "pnpm run test");
  const existing = Array.from({ length: 50 }, (_, i) => ({ id: `m-${i}`, name: `manual-${i}`, script: `echo ${i}`, runOnWorktreeCreation: false }));
  assert.equal(mergeDetectedCommands(existing, detection.commands).limited, true);
  assert.throws(() => normalizeCommandDetection({ ...detection, commands: [{ ...edited }] }), /INVALID_RESOURCE_COMMAND/);
  assert.deepEqual(normalizeCommandDetection({ ...detection, suggestions: [{ ...edited }] }), detection, "Old suggestion metadata is discarded without rejecting the record");
  const other = path.join(directory, "malformed"); await mkdir(other); await put("malformed/package.json", "invalid");
  const record = await service.save({ kind: "folder", name: "malformed", localPath: other });
  assert.deepEqual(record.commands, []); assert.ok(record.commandDetection.warnings.length);
});

test("A completed clone runs detection only after Git exits and never executes package scripts", async context => {
  const { directory } = await fixture(context);
  const calls = [];
  const runtime = createLoader({ "node:child_process": { spawn(command, args) {
    calls.push(command); assert.equal(command, "git");
    const child = new EventEmitter(); child.stderr = new EventEmitter(); child.stdout = { resume() {} };
    setImmediate(async () => { await writeFile(path.join(args.at(-1), "package.json"), JSON.stringify({ scripts: { build: "touch MUST_NOT_RUN" } })); child.emit("close", 0); });
    return child;
  } } });
  const { ResourceService: CloneService } = runtime("src/main-process/services/resourceService.ts");
  const saved = await new CloneService(path.join(directory, "clones.json")).clone({ operationId: "test-clone", url: "git@github.com:fixture/repo.git", name: "cloned", directory }, 1, () => {});
  assert.equal(saved.commands[0].script, "npm run build"); assert.deepEqual(calls, ["git"]);
  await assert.rejects(access(path.join(saved.localPath, "MUST_NOT_RUN")), { code: "ENOENT" });
});
