import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: (key) => { storage.delete(key); },
};

const {
  ensureReadBaseline, isSessionUnread, markSessionRead, readSessionMark,
} = createLoader()("src/utils/sessionReadMarks.ts");

test("基线保护历史会话；仅 lastReplyAt 晚于水位才未读", () => {
  storage.clear();
  const baseline = ensureReadBaseline("2026-11-07T10:00:00.000Z");
  assert.equal(ensureReadBaseline("2026-11-07T11:00:00.000Z"), baseline);
  const session = { id: "s1", kind: "agent", lastReplyAt: "2026-11-07T09:00:00.000Z" };
  assert.equal(isSessionUnread(session), false);
  assert.equal(isSessionUnread({ ...session, lastReplyAt: "2026-11-07T10:00:01.000Z" }), true);
  assert.equal(isSessionUnread({ ...session, lastReplyAt: undefined }), false);
  assert.equal(isSessionUnread({ ...session, kind: "shell", lastReplyAt: "2026-11-07T12:00:00.000Z" }), false);
  assert.equal(isSessionUnread({ ...session, archivedAt: "2026-11-07T12:00:00.000Z", lastReplyAt: "2026-11-07T12:00:00.000Z" }), false);
  markSessionRead("s1", "2026-11-07T10:00:01.000Z");
  assert.equal(readSessionMark("s1"), "2026-11-07T10:00:01.000Z");
  assert.equal(isSessionUnread({ ...session, lastReplyAt: "2026-11-07T10:00:01.000Z" }), false);
  markSessionRead("s1", "2026-11-07T09:00:00.000Z");
  assert.equal(readSessionMark("s1"), "2026-11-07T10:00:01.000Z");
});
