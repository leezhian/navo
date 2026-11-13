import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createLoader } from './helpers/load-typescript.mjs';

const { taskLink, parseTaskLink } = createLoader()('src/shared/taskLinks.ts');
test('本机链接往返并拒绝非任务路由、参数、凭据和路径折叠', () => {
  const id = 'e92a75d0-ef0c-4f4e-b709-d47d78230093';
  assert.deepEqual(parseTaskLink(taskLink(id)), { taskId: id });
  for (const input of ['https://task/a', 'navo://task', 'navo://task/', 'navo://task/a/b', 'navo://task/a/../b', 'navo://task/a?command=run', 'navo://task/a#b', 'navo://user@task/a', 'navo://task:80/a', 'navo://task/%2Fetc', 'navo://task/%ZZ', 'navo://task/a\n', 'navo://session/a', `navo://task/${'a'.repeat(129)}`]) assert.equal(parseTaskLink(input), null, input);
});

function fixture() {
  const app = new EventEmitter();
  const handlers = new Map();
  const registrations = [];
  app.isPackaged = false;
  app.setAsDefaultProtocolClient = scheme => registrations.push(scheme);
  const load = createLoader({ electron: { app, ipcMain: { handle: (name, handler) => handlers.set(name, handler) } } });
  let window;
  const router = load('src/main-process/taskLinks.ts').registerTaskLinks(() => window);
  const deliveries = [];
  const bind = () => {
    window = new EventEmitter();
    window.webContents = new EventEmitter();
    window.webContents.send = (channel, id) => deliveries.push({ channel, id });
    window.isDestroyed = () => false;
    window.minimized = true;
    window.isMinimized = () => window.minimized;
    window.restore = () => { window.minimized = false; };
    window.show = () => { window.shown = true; };
    window.focus = () => { window.focused = true; };
    router.bindWindow(window);
    return window;
  };
  const receive = url => { let prevented = false; app.emit('open-url', { preventDefault: () => { prevented = true; } }, url); return prevented; };
  const ready = sender => handlers.get('app:task-links-ready')({ sender: sender ?? window.webContents });
  return { app, router, receive, ready, bind, deliveries, registrations };
}

test('冷启动保留最新链接，任务加载与订阅完成后仅交付一次，外部 sender 不能领走', () => {
  const f = fixture();
  assert.equal(f.receive('navo://task/first'), true);
  f.receive('navo://task/latest');
  assert.deepEqual(f.deliveries, []);
  f.bind();
  f.ready({});
  assert.deepEqual(f.deliveries, []);
  f.ready(); f.ready();
  assert.deepEqual(f.deliveries, [{ channel: 'app:open-task', id: { taskId: 'latest' } }]);
});

test('热启动与第二实例恢复窗口；重载、关闭重建时重新等待监听就绪', () => {
  const f = fixture();
  const window = f.bind(); f.ready();
  f.app.emit('second-instance', {}, ['electron', 'navo://task/warm']);
  assert.equal(window.minimized, false); assert.equal(window.shown, true); assert.equal(window.focused, true);
  assert.deepEqual(f.deliveries.at(-1).id, { taskId: 'warm' });
  assert.equal(f.receive('navo://task/../other'), false);
  window.webContents.emit('did-start-loading');
  f.receive('navo://task/reload');
  assert.equal(f.deliveries.length, 1);
  f.ready(); assert.deepEqual(f.deliveries.at(-1).id, { taskId: 'reload' });
  window.emit('closed'); f.bind(); f.receive('navo://task/reopen');
  assert.equal(f.deliveries.length, 2);
  f.ready(); assert.deepEqual(f.deliveries.at(-1).id, { taskId: 'reopen' });
  f.router.registerProtocol(); assert.deepEqual(f.registrations, []);
  f.app.isPackaged = true; f.router.registerProtocol(); assert.deepEqual(f.registrations, ['navo']);
});

test('Windows/Linux 命令行冷启动链接也等待渲染进程', () => {
  const original = process.argv;
  try {
    process.argv = ['electron', 'navo://task/from-argv'];
    const f = fixture(); f.bind();
    assert.deepEqual(f.deliveries, []);
    f.ready(); assert.deepEqual(f.deliveries[0].id, { taskId: 'from-argv' });
  } finally { process.argv = original; }
});
