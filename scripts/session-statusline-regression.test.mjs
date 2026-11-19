import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLoader } from './helpers/load-typescript.mjs';

const load = createLoader();
const { parseStatusLinePayload } = load('src/main-process/services/taskSessions/statusLinePayload.ts');
const { SessionStatusLineServer } = load('src/main-process/services/taskSessions/sessionStatusLineServer.ts');
const { sessionContextPercent } = load('src/utils/sessionUsageLabel.ts');
const id = '3211c729-32c4-47d1-bde3-a89b73ea021d';
const otherId = '4211c729-32c4-47d1-bde3-a89b73ea021d';
const window = { context_window_size: 200000, used_percentage: 25, current_usage: { input_tokens: 2000, cache_creation_input_tokens: 8000, cache_read_input_tokens: 40000, output_tokens: 9999 } };
const payload = { session_id: id, context_window: window };
const agy = { product: 'antigravity', conversation_id: otherId, context_window: window };
const forwarder = path.resolve('src/main-process/services/taskSessions/statusline-forwarder.cjs');
function run(command, args, env, input, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr }));
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
async function directory(t) { const root = await mkdtemp(path.join(os.tmpdir(), 'navo-statusline-')); t.after(() => rm(root, { recursive: true, force: true })); return root; }
const post = (connection, body, headers = {}) => fetch(connection.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}`, ...headers }, body: JSON.stringify(body) });

test('状态栏解析按原生窗口计算：缓存分项、零值、比例回退及错误数据', () => {
  const parsed = parseStatusLinePayload('claude', payload);
  assert.equal(parsed.nativeSessionId, id); assert.equal(sessionContextPercent(parsed.usage), 25);
  assert.equal(parsed.usage.contextTokens, 50000); assert.equal(parsed.usage.outputTokens, undefined);
  assert.equal(sessionContextPercent(parseStatusLinePayload('antigravity', agy).usage), 25);
  assert.equal(parseStatusLinePayload('antigravity', payload), null);
  assert.equal(parseStatusLinePayload('claude', { ...payload, context_window: { ...window, current_usage: { input_tokens: 0 } } }).usage.contextTokens, 50000);
  assert.equal(parseStatusLinePayload('claude', { ...payload, context_window: { ...window, current_usage: undefined } }).usage.contextTokens, 50000);
  assert.equal(sessionContextPercent(parseStatusLinePayload('claude', { ...payload, context_window: { ...window, used_percentage: 0, current_usage: { input_tokens: 0 } } }).usage), 0);
  for (const value of [null, [], {}, { ...payload, session_id: '../escape' }, { ...payload, context_window: { ...window, context_window_size: 0 } }, { ...payload, context_window: { ...window, used_percentage: Infinity } }, { ...payload, context_window: { ...window, used_percentage: 101 } }, { ...payload, context_window: { ...window, current_usage: { input_tokens: 300000 } } }]) assert.equal(parseStatusLinePayload('claude', value), null);
});

test('回环状态栏服务隔离运行、检查来源及身份，撤销和旋转凭证拒绝迟到写入', async t => {
  const received = [];
  const server = new SessionStatusLineServer((sessionId, terminalId, value) => {
    if (sessionId === 'one' && value.nativeSessionId !== id) return false;
    received.push({ sessionId, terminalId, value }); return true;
  }); t.after(() => server.close());
  const one = await server.connect('one', 'pty-one', 'claude'), two = await server.connect('two', 'pty-two', 'antigravity');
  assert.equal((await post(one, payload)).status, 204); assert.equal((await post(two, agy)).status, 204);
  assert.deepEqual(received.map(item => [item.sessionId, item.terminalId]), [['one', 'pty-one'], ['two', 'pty-two']]);
  assert.equal((await post(one, { ...payload, session_id: otherId })).status, 409);
  assert.equal((await post(one, agy)).status, 422);
  assert.equal((await post(one, payload, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await post({ ...one, token: 'invalid' }, payload)).status, 401);
  const wrongHost = await new Promise((resolve, reject) => {
    const pending = request(one.url, { method: 'POST', headers: { Host: 'example.com', 'Content-Type': 'application/json', Authorization: `Bearer ${one.token}` } }, res => { res.resume(); resolve(res.statusCode); });
    pending.on('error', reject); pending.end(JSON.stringify(payload));
  });
  assert.equal(wrongHost, 403);
  assert.equal((await post(one, payload, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(one, { padding: 'x'.repeat(1024 * 1024) })).status, 413);
  assert.equal((await fetch(one.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${one.token}` }, body: '{broken' })).status, 400);
  const response = new Promise((resolve, reject) => {
    const pending = request(one.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${one.token}` } }, res => { res.resume(); resolve(res.statusCode); });
    pending.on('error', reject); pending.write('{'); server.revoke('one'); pending.end('}');
  });
  assert.equal(await response, 401);
  const renewed = await server.connect('two', 'new-pty', 'antigravity');
  assert.equal((await post(two, agy)).status, 401); assert.equal((await post(renewed, agy)).status, 204);
  assert.equal(received.at(-1).terminalId, 'new-pty');
});

test('独立转发器回传上下文并原样执行用户状态栏，回传失败仍保留用户输出', async t => {
  const root = await directory(t), seen = [];
  const server = new SessionStatusLineServer((...args) => { seen.push(args); return true; }); t.after(() => server.close());
  const connection = await server.connect('one', 'pty', 'claude');
  const original = path.join(root, 'original statusline.cjs');
  await writeFile(original, `let bytes=[];process.stdin.on('data',chunk=>bytes.push(chunk));process.stdin.on('end',()=>{require('node:fs').writeFileSync('received.json',Buffer.concat(bytes));process.stdout.write('用户原有状态栏');process.stderr.write('original error output');process.exitCode=7;});`);
  const body = JSON.stringify({ ...payload, unrelated: 'Not part of Navo observation' });
  const env = { NAVO_STATUSLINE_URL: connection.url, NAVO_STATUSLINE_TOKEN: connection.token, NAVO_STATUSLINE_PASSTHROUGH: `"${process.execPath}" "${original}"` };
  let result = await run(process.execPath, [forwarder], env, body, root);
  assert.equal(result.code, 7); assert.equal(result.stdout, '用户原有状态栏'); assert.equal(result.stderr, 'original error output');
  assert.equal(await readFile(path.join(root, 'received.json'), 'utf8'), body);
  assert.equal(seen.length, 1); assert.equal(seen[0][2].usage.contextTokens, 50000);
  server.revoke('one'); result = await run(process.execPath, [forwarder], env, '{invalid json', root);
  assert.equal(result.code, 7); assert.equal(result.stdout, '用户原有状态栏'); assert.equal(await readFile(path.join(root, 'received.json'), 'utf8'), '{invalid json');
  result = await run(process.execPath, [forwarder], { ...env, NAVO_STATUSLINE_URL: 'http://127.0.0.1:1/statusline' }, body, root);
  assert.equal(result.stdout, '用户原有状态栏'); assert.equal(seen.length, 1);
});

test('启动设置保留用户／项目状态栏、显式设置和默认状态栏，仅修改本次进程参数', async t => {
  const root = await directory(t), cwd = path.join(root, 'project'), configDir = path.join(root, 'claude');
  await mkdir(path.join(cwd, '.claude'), { recursive: true }); await mkdir(configDir);
  const files = [[path.join(configDir, 'settings.json'), { statusLine: { type: 'command', command: 'user-command', padding: 2 } }],
    [path.join(cwd, '.claude/settings.json'), { statusLine: { type: 'command', command: 'project-command' } }],
    [path.join(cwd, '.claude/settings.local.json'), { statusLine: { type: 'command', command: 'local-command', padding: 4 } }]];
  for (const [file, content] of files) await writeFile(file, JSON.stringify(content));
  const settingsPath = path.join(cwd, 'extra settings.json'); await writeFile(settingsPath, JSON.stringify({ permissions: { allow: ['Read'] }, statusLine: { command: 'explicit-command', refreshInterval: 5 } }));
  const runtime = createLoader({ electron: { app: { isPackaged: false, getAppPath: () => process.cwd() } }, '../agents/agentEnvironment': { findAgentBinary: async () => ({ filename: process.execPath }) } });
  const { prepareStatusLineLaunch } = runtime('src/main-process/services/taskSessions/statusLineLaunch.ts');
  let connections = 0;
  const input = { agent: 'claude', cwd, env: { CLAUDE_CONFIG_DIR: configDir }, args: ['--verbose'], help: '--settings', connect: async () => { connections++; return { url: 'http://127.0.0.1:12345/statusline', token: 'private-token' }; } };
  let launch = await prepareStatusLineLaunch(input);
  assert.equal(launch.env.NAVO_STATUSLINE_PASSTHROUGH, 'local-command');
  assert.equal(JSON.parse(launch.args.at(-1)).statusLine.padding, 4);
  launch = await prepareStatusLineLaunch({ ...input, args: ['--verbose', '--settings', 'extra settings.json'] });
  const settings = JSON.parse(launch.args.at(-1));
  assert.equal(launch.env.NAVO_STATUSLINE_PASSTHROUGH, 'explicit-command');
  assert.equal(launch.env.NAVO_STATUSLINE_TOKEN, 'private-token'); assert.ok(!launch.args.join(' ').includes('private-token'));
  assert.deepEqual(launch.args.slice(0, 2), ['--verbose', '--settings']); assert.deepEqual(settings.permissions, { allow: ['Read'] });
  assert.equal(settings.statusLine.padding, 4); assert.equal(settings.statusLine.refreshInterval, 5);
  for (const [file, content] of files) assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), content);
  assert.equal(JSON.parse(await readFile(settingsPath, 'utf8')).statusLine.command, 'explicit-command');
  launch = await prepareStatusLineLaunch({ ...input, args: ['--setting-sources=user'] });
  assert.equal(launch.env.NAVO_STATUSLINE_PASSTHROUGH, 'user-command');
  const agyRoot = path.join(root, 'agy'); await mkdir(agyRoot);
  await writeFile(path.join(agyRoot, 'settings.json'), JSON.stringify({ statusLine: { enabled: true, type: '', command: '' } }));
  launch = await prepareStatusLineLaunch({ ...input, agent: 'antigravity', nativeHistoryRoot: agyRoot });
  assert.equal(JSON.parse(launch.args.at(-1)).statusLine.stack_with_default, true);
  await writeFile(path.join(agyRoot, 'settings.json'), JSON.stringify({ statusLine: { command: 'agy-command', stack_with_default: true } }));
  launch = await prepareStatusLineLaunch({ ...input, agent: 'antigravity', nativeHistoryRoot: agyRoot });
  assert.equal(launch.env.NAVO_STATUSLINE_PASSTHROUGH, 'agy-command'); assert.equal(JSON.parse(launch.args.at(-1)).statusLine.stack_with_default, true);
  const before = connections;
  assert.equal(await prepareStatusLineLaunch({ ...input, help: '--model' }), undefined);
  assert.equal(await prepareStatusLineLaunch({ ...input, args: ['--settings={"statusLine":{"enabled":false}}'] }), undefined);
  assert.equal(await prepareStatusLineLaunch({ ...input, args: ['--settings', 'missing.json'] }), undefined);
  assert.equal(await prepareStatusLineLaunch({ ...input, args: ['--settings', '{broken'] }), undefined);
  assert.equal(connections, before);
});

test('真实启动组装将回调加入新建与恢复参数，配置中的命令可执行且不再次交付 prompt', async t => {
  const root = await directory(t), cwd = path.join(root, 'directory with spaces'), configDir = path.join(root, 'config');
  await mkdir(cwd);await mkdir(configDir);
  const original = path.join(root, 'original.cjs');
  await writeFile(original, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('existing statusline'));`);
  await writeFile(path.join(configDir, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: `"${process.execPath}" "${original}"` } }));
  const shellEnv = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const selection = { agentId: 'claude', modelId: 'model', modelName: 'Model', modeId: 'default', modeName: 'Default', effort: null };
  const settingsArgs = ['--settings', '{"permissions":{"allow":["Read"]}}'];
  const runtime = createLoader({
    electron: { app: { isPackaged: false, getAppPath: () => process.cwd() } },
    '../agents/agentEnvironment': { agentShellEnvironment: async () => shellEnv, findAgentBinary: async () => ({ filename: process.execPath }), runAgentProbe: async () => ({ code: 0, stdout: '--settings --model --permission-mode --session-id --resume', stderr: '' }) },
    '../agents/agentDetection': { detectAgent: async () => ({ binaryPath: '/fake-cli', status: 'installed', auth: 'signedIn' }) },
    '../../../utils/taskAgentSelection': { matchesAgentCapabilities: () => true },
  });
  const { prepareAgentLaunch } = runtime('src/main-process/services/taskSessions/agentLaunch.ts');
  const { prepareStatusLineLaunch } = runtime('src/main-process/services/taskSessions/statusLineLaunch.ts');
  const agents = { repository: { read: async () => ({ configurations: [{ id: 'claude', enabled: true, args: settingsArgs }] }), environment: () => ({}) }, capabilities: async () => ({}) };
  const received = [], server = new SessionStatusLineServer((...args) => { received.push(args); return true; });t.after(() => server.close());
  const attach = (env, help, args) => prepareStatusLineLaunch({ agent: 'claude', cwd, env, help, args, connect: () => server.connect('session', 'pty', 'claude') });
  const fresh = await prepareAgentLaunch(agents, selection, id, 'First prompt', false, undefined, undefined, undefined, undefined, undefined, undefined, attach);
  assert.equal(fresh.args.filter(arg => arg === '--settings').length, 1);assert.deepEqual(fresh.args.slice(-2), ['--', 'First prompt']);
  let settings = JSON.parse(fresh.args[fresh.args.indexOf('--settings') + 1]);assert.deepEqual(settings.permissions, { allow: ['Read'] });
  const shell = process.platform === 'win32' ? process.env.ComSpec : '/bin/sh';
  const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', settings.statusLine.command] : ['-c', settings.statusLine.command];
  const result = await run(shell, shellArgs, fresh.env, JSON.stringify(payload), cwd);
  assert.equal(result.code, 0);assert.equal(result.stdout, 'existing statusline');assert.equal(received[0][2].usage.contextTokens, 50000);
  const resumed = await prepareAgentLaunch(agents, selection, id, 'Do not send again', true, undefined, undefined, undefined, undefined, undefined, undefined, attach);
  assert.deepEqual(resumed.args.slice(-2), ['--resume', id]);assert.ok(!resumed.args.includes('Do not send again'));assert.ok(resumed.env.NAVO_STATUSLINE_TOKEN);
});
