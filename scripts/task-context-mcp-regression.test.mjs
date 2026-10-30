import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskContextServer } = load("src/main-process/services/taskSessions/taskContextServer.ts");
const { contextLaunchArguments, supportsSessionContext } = load("src/main-process/services/taskSessions/contextLaunchArguments.ts");
test("Read-only MCP isolates tasks, reads current data, rejects arbitrary ids and revokes session credentials", async context => {
  const tasks = new Map([["one", { id: "one", title: "One", description: "initial", status: "TODO", contextVersion: 1, notes: [{ id: "note-one", title: "A", content: "private note" }] }], ["two", { id: "two", title: "Two", description: "other secret", status: "TODO" }]]);
  const server = new TaskContextServer(async id => { const task = tasks.get(id); if (!task) throw Error(); return task; });
  context.after(() => server.close());
  const one = await server.connect("session-one", "one"), two = await server.connect("session-two", "two");
  async function request(connection, method, params = {}, headers = {}) {
    return fetch(connection.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.token}`, ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  }
  const initialize = await (await request(one, "initialize", { protocolVersion: "2025-03-26" })).json();
  assert.equal(initialize.result.protocolVersion, "2025-03-26");
  const listed = await (await request(one, "tools/list")).json();
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ["get_task_context", "get_task_note"]);
  assert.ok(listed.result.tools.every(tool => tool.annotations.readOnlyHint));
  const read = async (connection, name, args = {}) => (await (await request(connection, "tools/call", { name, arguments: args })).json()).result;
  let result = await read(one, "get_task_context");
  assert.ok(!JSON.stringify(result).includes("private note")); assert.ok(!JSON.stringify(result).includes("other secret"));
  tasks.get("one").description = "live update"; tasks.get("one").contextVersion++;
  result = JSON.parse((await read(one, "get_task_context")).content[0].text);
  assert.equal(result.prompt, "live update"); assert.equal(result.version, 2);
  assert.equal(JSON.parse((await read(one, "get_task_note", { noteId: "note-one" })).content[0].text).content, "private note");
  assert.equal((await read(two, "get_task_note", { noteId: "note-one" })).isError, true);
  assert.equal((await read(one, "get_task_context", { taskId: "two" })).isError, true);
  assert.equal((await read(one, "write_task_note", { noteId: "note-one" })).isError, true);
  assert.equal((await request(one, "tools/list", {}, { Origin: "https://evil.test" })).status, 403);
  assert.equal((await request({ ...one, token: "bad" }, "tools/list")).status, 401);
  server.revoke("session-one");
  assert.equal((await request(one, "tools/list")).status, 401); assert.equal((await request(two, "tools/list")).status, 200);
  const renewed = await server.connect("session-two", "two");
  assert.equal((await request(two, "tools/list")).status, 401);
  tasks.get("two").status = "ARCHIVED";
  assert.equal((await request(renewed, "tools/call", { name: "get_task_context" })).status, 401);
});
test("Adapters use process-scoped configuration, unknown CLIs use snapshots without global writes", () => {
  const connection = { url: "http://127.0.0.1:1234/mcp", token: "temporary-secret" };
  assert.equal(supportsSessionContext("claude", "--mcp-config"), true);
  assert.equal(supportsSessionContext("claude", "--model"), false);
  assert.equal(supportsSessionContext("grok", "--config"), false);
  assert.equal(supportsSessionContext("antigravity", "--settings"), false);
  const claude = contextLaunchArguments("claude", connection, "--append-system-prompt");
  assert.equal(JSON.parse(claude.args[1]).mcpServers.navo_task.headers.Authorization, "Bearer temporary-secret");
  const codex = contextLaunchArguments("codex", connection, "--config --no-daemon");
  assert.equal(codex.env.NAVO_TASK_CONTEXT_TOKEN, connection.token);
  assert.ok(!codex.args.join(" ").includes(connection.token)); assert.ok(codex.args.includes("--no-daemon"));
});
