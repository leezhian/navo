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

test("手动未读独立于水位持久化，已读清除手动标记且不回退回复水位", () => {
  storage.clear();
  const marks = createLoader()("src/utils/sessionReadMarks.ts");
  const session = { id: "manual", kind: "agent" };
  marks.markSessionRead(session.id, "2027-01-01T00:00:00.000Z");
  marks.markSessionUnread(session.id);
  assert.equal(marks.isSessionUnread(session), true);
  const reloaded = createLoader()("src/utils/sessionReadMarks.ts");
  assert.equal(reloaded.isSessionUnread(session), true);
  assert.equal(reloaded.isSessionUnread({ ...session, archivedAt: "date" }), false);
  assert.equal(reloaded.isSessionUnread({ ...session, kind: "shell" }), false);
  reloaded.markSessionRead(session.id, "2026-01-01T00:00:00.000Z");
  assert.equal(reloaded.isSessionUnread(session), false);
  assert.equal(reloaded.readSessionMark(session.id), "2027-01-01T00:00:00.000Z");
  assert.equal(reloaded.isSessionUnread({ ...session, lastReplyAt: "2027-01-01T00:00:01.000Z" }), true);
});
