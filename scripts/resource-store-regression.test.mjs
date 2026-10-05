import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const existing = { id: "existing", kind: "repo", name: "Existing", localPath: "/test/existing", available: true };
const added = { id: "added", kind: "repo", name: "Added", localPath: "/test/added", available: true };

function fixture(remove = async () => undefined) {
  const requests = [];
  const load = createLoader({ "@/services/resourceApi": { resourceApi: {
    list: () => new Promise((resolve, reject) => requests.push({ resolve, reject })), remove,
  } } });
  return { store: load("src/stores/resourceStore.ts").useResourceStore, requests };
}

test("刷新旧快照不覆盖已经完成的资源新增和移除", async () => {
  const { store, requests } = fixture();
  store.setState({ records: [existing], loaded: true });
  const refreshing = store.getState().refresh();
  store.getState().upsert(added);
  await store.getState().remove(existing.id);
  requests[0].resolve([existing]);
  await Promise.resolve();
  assert.deepEqual(store.getState().records, [added]);
  assert.equal(requests.length, 2);
  assert.equal(store.getState().loading, true);
  requests[1].resolve([added]);
  await refreshing;
  assert.deepEqual(store.getState().records, [added]);
  assert.equal(store.getState().loading, false);
});

test("首次读取期间添加及再次编辑资源，重新读取完整列表且不接受中间旧快照", async () => {
  const { store, requests } = fixture();
  const refreshing = store.getState().refresh();
  store.getState().upsert(added);
  requests[0].resolve([existing]);
  await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.equal(store.getState().loaded, false);
  const edited = { ...added, name: "Edited" };
  store.getState().upsert(edited);
  requests[1].resolve([existing, added]);
  await Promise.resolve();
  assert.deepEqual(store.getState().records, [edited]);
  assert.equal(requests.length, 3);
  await store.getState().refresh();
  assert.equal(requests.length, 3);
  requests[2].resolve([existing, edited]);
  await refreshing;
  assert.deepEqual(store.getState().records, [existing, edited]);
  assert.equal(store.getState().loaded, true);
});

test("旧刷新失败不覆盖新变更，最新读取失败保留记录并允许重试", async () => {
  const { store, requests } = fixture();
  store.setState({ records: [existing], loaded: true });
  const refreshing = store.getState().refresh();
  const edited = { ...existing, name: "Edited" };
  store.getState().upsert(edited);
  requests[0].reject(new Error("stale failure"));
  await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.equal(store.getState().error, null);
  const error = new Error("current failure");
  requests[1].reject(error);
  await refreshing;
  assert.deepEqual(store.getState().records, [edited]);
  assert.equal(store.getState().error, error);
  assert.equal(store.getState().loading, false);
  const retrying = store.getState().refresh();
  requests[2].resolve([edited]);
  await retrying;
  assert.equal(store.getState().error, null);
});

test("移除失败不使正常刷新失效，也不丢失原记录", async () => {
  const { store, requests } = fixture(async () => { throw new Error("remove failed"); });
  store.setState({ records: [existing], loaded: true });
  const refreshing = store.getState().refresh();
  await assert.rejects(store.getState().remove(existing.id), /remove failed/);
  requests[0].resolve([existing]);
  await refreshing;
  assert.equal(requests.length, 1);
  assert.deepEqual(store.getState().records, [existing]);
});

test("资源服务统一转发克隆进度、取消订阅和拖入路径，并检查桌面能力", (context) => {
  const previousWindow = globalThis.window;
  context.after(() => { globalThis.window = previousWindow; });
  let desktop = true;
  let listener;
  let unsubscribed = false;
  const file = { name: "repo" };
  globalThis.window = { navo: { resources: {
    onCloneProgress(callback) { listener = callback; return () => { unsubscribed = true; }; },
    getDroppedPath(value) { assert.equal(value, file); return "/test/repo"; },
  } } };
  const { resourceApi } = createLoader({ "./settingsApi": { isDesktop: () => desktop } })("src/services/resourceApi.ts");
  let received;
  const unsubscribe = resourceApi.onCloneProgress((value) => { received = value; });
  const progress = { operationId: "clone", message: "Cloning" };
  listener(progress);
  assert.equal(received, progress);
  unsubscribe();
  assert.equal(unsubscribed, true);
  assert.equal(resourceApi.getDroppedPath(file), "/test/repo");
  desktop = false;
  assert.throws(() => resourceApi.onCloneProgress(() => undefined), /DESKTOP_REQUIRED/);
  assert.throws(() => resourceApi.getDroppedPath(file), /DESKTOP_REQUIRED/);
});
