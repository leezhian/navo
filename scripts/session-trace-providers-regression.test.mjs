import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, appendFile, mkdir, copyFile, readFile, rename, realpath } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createLoader } from './helpers/load-typescript.mjs';

const load = createLoader();
const { TraceIndex } = load('extensions/session-trace/runtime/traceIndex.ts');
const { resolveSource } = load('extensions/session-trace/runtime/source.ts');
const fixtures = path.resolve('scripts/fixtures/session-trace');
const id = '00000000-0000-4000-8000-000000000001';
async function sandbox(run) { const root = await mkdtemp(path.join(os.tmpdir(), 'navo-trace-provider-')); try { await run(root); } finally { await rm(root, { recursive: true, force: true }); } }
async function grokSession(root, { events = true, updates = true } = {}) {
  const cwd = path.join(root, 'project'), native = path.join(root, 'grok');
  const directory = path.join(native, 'sessions', encodeURIComponent(cwd), id);
  await mkdir(directory, { recursive: true });
  await copyFile(path.join(fixtures, 'grok/chat_history.jsonl'), path.join(directory, 'chat_history.jsonl'));
  if (events) await copyFile(path.join(fixtures, 'grok/events.jsonl'), path.join(directory, 'events.jsonl'));
  if (updates) await copyFile(path.join(fixtures, 'grok/updates.jsonl'), path.join(directory, 'updates.jsonl'));
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify({ info: { id, cwd }, generated_title: 'fixture' }));
  return { directory, source: path.join(directory, 'chat_history.jsonl'), session: { id, cwd, root: native, provider: 'grok', createdAt: '2026-11-12T08:00:00Z' } };
}
async function antigravitySession(root) {
  const cwd = path.join(root, 'project'), native = path.join(root, 'antigravity');
  const directory = path.join(native, 'brain', id, '.system_generated', 'logs');
  await mkdir(directory, { recursive: true });
  await copyFile(path.join(fixtures, 'antigravity/transcript_full.jsonl'), path.join(directory, 'transcript_full.jsonl'));
  return { directory, source: path.join(directory, 'transcript_full.jsonl'), session: { id, cwd, root: native, provider: 'antigravity', createdAt: '2026-11-12T08:00:00Z' } };
}
const find = (page, predicate) => page.events.find(predicate);

test('Grok: chat_history content with partial events.jsonl timing, empty and bad lines', () => sandbox(async root => {
  const { source } = await grokSession(root);
  const index = new TraceIndex(source, path.join(root, 'cache.sqlite'), 'grok');
  try {
    await index.refresh();
    const page = index.page({ kind: 'page' });
    // 空行跳过；坏行与未知类型保留为未知；空正文的助手记录只留工具调用。
    assert.equal(page.total, 12);
    assert.equal(page.stats.rounds, 2);
    assert.equal(page.stats.tools, 3);
    assert.equal(page.stats.errors, 1);
    assert.equal(page.stats.requests, null);
    assert.equal(index.page({ kind: 'page', filter: 'unknown' }).total, 2);
    assert.equal(index.page({ kind: 'page', filter: 'context' }).total, 1);
    assert.equal(index.page({ kind: 'page', filter: 'reasoning' }).events[0].preview, 'fixture reasoning summary');
    const first = find(page, event => event.preview === 'fixture first prompt');
    assert.equal(first.timestamp, '2026-11-12T08:00:00.000Z');
    // 第 2 轮的 events turn_number 与 prompt_index 不符，改由 updates 的 promptIndex 精确补全；events 已对上的第一条不被 updates 的更晚时间覆盖。
    const second = find(page, event => event.kind === 'user' && event.preview.startsWith('fixture second prompt'));
    assert.equal(second.timestamp, '2026-11-12T08:01:10.000Z');
    assert.match(second.preview, /\[image\]/);
    assert.doesNotMatch(second.preview, /QUJDRA/);
    const tools = index.page({ kind: 'page', filter: 'tool' }).events;
    const bash = await index.detail(tools.find(event => event.callId === 'call_fixture_1').id);
    assert.equal(bash.timestamp, '2026-11-12T08:00:02.000Z');
    assert.equal(bash.durationMs, 1500);
    assert.equal(bash.result, 'fixture tool output');
    assert.match(bash.raw, /tool_result/);
    const failed = tools.find(event => event.callId === 'call_fixture_2');
    assert.equal(failed.kind, 'error');
    assert.equal(failed.durationMs, 200);
    const third = await index.detail(tools.find(event => event.callId === 'call_fixture_3').id);
    assert.equal(third.timestamp, '2026-11-12T08:01:02.000Z');
    assert.equal(third.durationMs, 1000);
    assert.equal(third.result, 'fixture untimed output');
    // 时间线只含有时间的事件；框选命中不包含无时间的事件。
    assert.deepEqual(index.timeline().events.map(event => event.callId ?? event.kind), ['user', 'call_fixture_1', 'call_fixture_2', 'user', 'call_fixture_3']);
    const ranged = index.page({ kind: 'page', from: '2026-11-12T08:00:01.000Z', to: '2026-11-12T08:00:02.500Z' });
    assert.equal(ranged.events[ranged.rangeFirstIndex].callId, 'call_fixture_1');
    assert.equal(index.page({ kind: 'page', search: 'fixture reasoning', from: '2026-11-12T07:00:00.000Z', to: '2026-11-12T09:00:00.000Z' }).rangeFirstIndex, null);
  } finally { index.close(); }
}));

test('Grok: whole-file replacement and new events rebuild instead of appending by offset', () => sandbox(async root => {
  const { directory, source } = await grokSession(root);
  const cache = path.join(root, 'cache.sqlite');
  let index = new TraceIndex(source, cache, 'grok');
  try {
    await index.refresh();
    assert.equal(await index.refresh(), false);
    // events.jsonl 追加了第 3 个工具的完成记录，已建好的工具行需要补上时间。
    await appendFile(path.join(directory, 'events.jsonl'), '\n' + JSON.stringify({ ts: '2026-11-12T08:01:03.000Z', type: 'tool_completed', tool_name: 'bash', duration_ms: 1000, outcome: 'success', tool_call_id: 'call_fixture_3' }) + '\n');
    assert.equal(await index.refresh(), true);
    const third = index.page({ kind: 'page', filter: 'tool' }).events.find(event => event.callId === 'call_fixture_3');
    assert.equal(third.timestamp, '2026-11-12T08:01:02.000Z');
    assert.equal(third.durationMs, 1000);
    // CLI 先写临时文件再整体替换：前文被改写也要反映出来，而不是按旧偏移只读新增部分。
    const original = await readFile(source, 'utf8');
    const rewritten = original.replace('fixture first prompt', 'fixture edited prompt') + JSON.stringify({ type: 'user', content: [{ type: 'text', text: 'fixture third prompt' }], prompt_index: 3 }) + '\n';
    await writeFile(source + '.tmp', rewritten);
    await rename(source + '.tmp', source);
    assert.equal(await index.refresh(), true);
    assert.equal(index.page({ kind: 'page', search: 'fixture first prompt' }).total, 0);
    assert.equal(index.page({ kind: 'page', search: 'fixture edited prompt' }).total, 1);
    assert.equal(index.stats().rounds, 3);
    assert.equal(index.stats().events, 13);
    // 新进程重开时时间只在内存，必须重建一次以恢复时间。
    index.close();
    index = new TraceIndex(source, cache, 'grok');
    await index.refresh();
    assert.equal(index.page({ kind: 'page', filter: 'tool' }).events.find(event => event.callId === 'call_fixture_1').durationMs, 1500);
  } finally { index.close(); }
}));

test('Grok: a session without events.jsonl has no time at all and an empty log stays empty', () => sandbox(async root => {
  const { directory, source } = await grokSession(root, { events: false, updates: false });
  let index = new TraceIndex(source, path.join(root, 'cache.sqlite'), 'grok');
  try {
    await index.refresh();
    const stats = index.stats();
    assert.equal(stats.events, 12);
    assert.equal(index.timeline().events.length, 0);
    index.close();
    await writeFile(path.join(directory, 'empty.jsonl'), '');
    index = new TraceIndex(path.join(directory, 'empty.jsonl'), path.join(root, 'empty.sqlite'), 'grok');
    await index.refresh();
    assert.equal(index.stats().events, 0);
    assert.equal(index.page({ kind: 'page' }).total, 0);
  } finally { index.close(); }
}));

test('Grok: source resolution checks the exact session directory and distinguishes missing directory', () => sandbox(async root => {
  const { directory, source, session } = await grokSession(root);
  assert.equal(await resolveSource(session), await realpath(source));
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify({ info: { id, cwd: '/other' } }));
  await assert.rejects(resolveSource(session), /SOURCE_INVALID/);
  await rm(path.join(directory, 'summary.json'));
  await rm(source);
  await assert.rejects(resolveSource(session), /SOURCE_MISSING/);
  await assert.rejects(resolveSource({ ...session, id: '00000000-0000-4000-8000-000000000002' }), /SOURCE_ROOT_MISSING/);
  await assert.rejects(resolveSource({ ...session, root: path.join(root, 'absent') }), /SOURCE_ROOT_MISSING/);
}));

test('Antigravity: ordered tool pairing, statuses, request grouping, empty and bad lines', () => sandbox(async root => {
  const { source } = await antigravitySession(root);
  const index = new TraceIndex(source, path.join(root, 'cache.sqlite'), 'antigravity');
  try {
    await index.refresh();
    const page = index.page({ kind: 'page' });
    assert.equal(page.total, 20);
    assert.equal(page.stats.rounds, 2);
    assert.equal(page.stats.requests, 5);
    assert.equal(page.stats.tools, 3);
    // 失败的工具结果、ERROR_MESSAGE 与两条 status=ERROR 的规划各计一次；INVALID 回复保持原类型。
    assert.equal(page.stats.errors, 4);
    const tools = index.page({ kind: 'page', filter: 'tool' }).events;
    const run = await index.detail(tools.find(event => event.callId === 'step:1:0').id);
    assert.equal(run.tool, 'run_command');
    assert.equal(run.result, 'fixture command output');
    assert.equal(run.durationMs, 1500);
    assert.match(run.raw, /GENERIC/);
    const view = await index.detail(tools.find(event => event.callId === 'step:1:1').id);
    assert.equal(view.kind, 'error');
    assert.match(view.result, /fixture not found/);
    const running = await index.detail(tools.find(event => event.callId === 'step:4:0').id);
    assert.equal(running.running, true);
    assert.equal(running.durationMs, undefined);
    assert.equal(running.result, 'fixture still running');
    // 中间插入其他记录后到来的结果不再配对，单独作为工具结果显示。
    const orphan = find(page, event => event.preview === 'fixture orphan output');
    assert.equal(orphan.kind, 'tool');
    assert.equal(orphan.callId, undefined);
    assert.equal(find(page, event => event.preview === 'fixture invalid response').kind, 'assistant');
    assert.equal(find(page, event => event.preview === 'fixture checkpoint').kind, 'compaction');
    assert.equal(find(page, event => event.preview === 'fixture thinking').kind, 'reasoning');
    const plannerError = find(page, event => event.preview === 'fixture planner failed');
    assert.equal(plannerError.kind, 'error');
    assert.equal(find(page, event => event.preview === 'fixture error thinking').kind, 'reasoning');
    assert.equal(find(page, event => event.preview === 'fixture error reply').kind, 'assistant');
    assert.equal(page.events.filter(event => event.preview === 'fixture planner failed').length, 1);
    const fallback = page.events.filter(event => event.preview === 'fixture fallback thinking');
    assert.equal(fallback.length, 2);
    assert.deepEqual(fallback.map(event => event.kind).sort(), ['error', 'reasoning']);
    assert.equal(find(page, event => event.preview === 'fixture fallback reply').kind, 'assistant');
    assert.equal(index.page({ kind: 'page', filter: 'unknown' }).total, 2);
    assert.equal(index.page({ kind: 'page', search: 'fixture watcher' }).total, 1);
  } finally { index.close(); }
}));

test('Antigravity: appended steps are read incrementally', () => sandbox(async root => {
  const { source } = await antigravitySession(root);
  const index = new TraceIndex(source, path.join(root, 'cache.sqlite'), 'antigravity');
  try {
    await index.refresh();
    await appendFile(source, JSON.stringify({ step_index: 14, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-11-12T08:00:20.000Z', content: 'fixture third message' }) + '\n');
    assert.equal(await index.refresh(), true);
    assert.equal(index.stats().rounds, 3);
    await appendFile(source, JSON.stringify({ step_index: 15, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-12T08:00:21.000Z', content: 'fixture no usage' }) + '\n');
    await index.refresh();
    assert.equal(index.stats().requests, 6);
  } finally { index.close(); }
}));

test('Antigravity: source resolution prefers transcript_full, falls back, and checks the workspace', () => sandbox(async root => {
  const { directory, source, session } = await antigravitySession(root);
  assert.equal(await resolveSource(session), await realpath(source));
  await rename(source, path.join(directory, 'transcript.jsonl'));
  assert.equal(await resolveSource(session), await realpath(path.join(directory, 'transcript.jsonl')));
  const db = new DatabaseSync(path.join(session.root, 'conversation_summaries.db'));
  db.exec('CREATE TABLE conversation_summaries(conversation_id TEXT, workspace_uris TEXT)');
  db.prepare('INSERT INTO conversation_summaries VALUES(?,?)').run(id, JSON.stringify([pathToFileURL(session.cwd).href]));
  assert.equal(await resolveSource(session), await realpath(path.join(directory, 'transcript.jsonl')));
  db.prepare('UPDATE conversation_summaries SET workspace_uris=?').run(JSON.stringify([pathToFileURL(path.join(root, 'other')).href]));
  db.close();
  await assert.rejects(resolveSource(session), /SOURCE_INVALID/);
  await rm(path.join(session.root, 'conversation_summaries.db'));
  await rm(path.join(directory, 'transcript.jsonl'));
  await assert.rejects(resolveSource(session), /SOURCE_MISSING/);
  await assert.rejects(resolveSource({ ...session, id: '00000000-0000-4000-8000-000000000002' }), /SOURCE_ROOT_MISSING/);
}));

test('Grok: updates.jsonl fills only exact matches, does not override events.jsonl, and usage.json is ignored', () => sandbox(async root => {
  const { directory, source } = await grokSession(root);
  const index = new TraceIndex(source, path.join(root, 'cache.sqlite'), 'grok');
  try {
    await index.refresh();
    const first = index.page({ kind: 'page' }).events.find(event => event.preview === 'fixture first prompt');
    assert.equal(first.timestamp, '2026-11-12T08:00:00.000Z');
    // 轨迹不再统计 Token：usage.json 出现或变化都不触发刷新，统计里也没有 Token 字段。
    await writeFile(path.join(directory, 'usage.json'), JSON.stringify({ session: { totalTokens: 25000 } }));
    assert.equal(await index.refresh(), false);
    assert.deepEqual(Object.keys(index.stats()).sort(), ['errors', 'events', 'requests', 'rounds', 'tools']);
  } finally { index.close(); }
}));

test('host describes Grok and Antigravity sessions with their native roots and rejects other agents', async () => {
  const { EventEmitter } = await import('node:events');
  const { randomUUID } = await import('node:crypto');
  const opened = [];
  const loadRuntime = createLoader({ electron: { utilityProcess: { fork: () => {
    const child = new EventEmitter();
    child.postMessage = data => { if (data.type === 'open') opened.push(data.session); queueMicrotask(() => child.emit('message', { id: data.id, result: true })); };
    child.kill = () => { queueMicrotask(() => child.emit('exit', 0)); return true; };
    return child;
  } } } });
  const { TraceRuntime } = loadRuntime('src/main-process/services/extensions/traceRuntime.ts');
  const extension = { status: { enabled: true, compatible: true, operation: 'idle' }, directory: '/isolated/trace-test', installedDirectory: '/isolated/trace-test/installed', reportRuntimeFailure: () => undefined };
  const sessions = {
    grok: { id: 'grok', kind: 'agent', nativeSessionId: id, cwd: '/isolated/work', agent: { agentId: 'grok' }, createdAt: '2026-11-12T00:00:00Z' },
    antigravity: { id: 'antigravity', kind: 'agent', nativeSessionId: id, nativeHistoryRoot: '/isolated/antigravity', cwd: '/isolated/work', agent: { agentId: 'antigravity' }, createdAt: '2026-11-12T00:00:00Z' },
    other: { id: 'other', kind: 'agent', nativeSessionId: id, cwd: '/isolated/work', agent: { agentId: 'other' }, createdAt: '2026-11-12T00:00:00Z' },
  };
  const runtime = new TraceRuntime(() => extension, async key => sessions[key], () => undefined);
  const previous = process.env.GROK_HOME;
  process.env.GROK_HOME = '/isolated/grok-home';
  try {
    await runtime.open('grok', 1, randomUUID());
    await runtime.open('antigravity', 1, randomUUID());
    assert.deepEqual(opened.map(session => [session.provider, session.root]), [['grok', '/isolated/grok-home'], ['antigravity', '/isolated/antigravity']]);
    await assert.rejects(runtime.open('other', 1, randomUUID()), /UNSUPPORTED_PROVIDER/);
  } finally {
    if (previous === undefined) delete process.env.GROK_HOME; else process.env.GROK_HOME = previous;
    await runtime.closeAll();
  }
});
