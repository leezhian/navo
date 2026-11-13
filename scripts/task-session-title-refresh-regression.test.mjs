import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

test("详情显示和切回时按任务刷新标题，隐藏、尺寸变化及卸载不重复请求", context => {
  const requests = [];
  const callbacks = [];
  let cleanup;
  let disconnected = false;
  const element = {};
  const previous = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    constructor(callback) { callbacks.push(callback); }
    observe(target) { assert.equal(target, element); }
    disconnect() { disconnected = true; }
  };
  context.after(() => {
    if (previous === undefined) delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver = previous;
  });
  const load = createLoader({
    react: { useEffect: effect => { cleanup = effect(); } },
    "@/stores/taskSessionStore": { useTaskSessionStore: { getState: () => ({ refresh: id => { requests.push(id); } }) } },
  });
  const { useTaskSessionTitleRefresh } = load("src/hooks/useTaskSessionTitleRefresh.ts");
  useTaskSessionTitleRefresh("task-one", { current: element });
  const notify = (visible, width = 800) => callbacks[0]([{ isIntersecting: visible, intersectionRect: { width, height: 600 } }]);
  notify(false);
  assert.deepEqual(requests, []);
  notify(true);
  notify(true, 900);
  assert.deepEqual(requests, ["task-one"]);
  notify(false, 0);
  notify(true);
  assert.deepEqual(requests, ["task-one", "task-one"]);
  cleanup();
  assert.equal(disconnected, true);
  assert.equal(requests.length, 2);
});
