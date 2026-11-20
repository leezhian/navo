import type { TaskNoteVersion } from "@/shared/taskNoteTypes";
import { noteChecklistMarkers } from "./taskNoteChecklist";

function checklistLines(content: string) {
  const entries = new Map<string, { line: number; checked: boolean }>();
  const counts = new Map<string, number>();
  for (const { label, line, checked } of noteChecklistMarkers(content)) {
    const occurrence = (counts.get(label) ?? 0) + 1;
    counts.set(label, occurrence);
    entries.set(JSON.stringify([label, occurrence]), { line, checked });
  }
  return entries;
}

/** 按原文和出现顺序配对；标题或条目文字发生变化时仍由普通 Diff 展示。 */
export function noteCheckboxChanges(before: string, after: string) {
  const previous = checklistLines(before);
  return [...checklistLines(after)].flatMap(([key, { line, checked }]) => {
    const original = previous.get(key);
    return original && original.checked !== checked ? [{ line, checked }] : [];
  });
}

function isCheckboxOnly(previous: TaskNoteVersion, current: TaskNoteVersion) {
  if (previous.title !== current.title) return false;
  const before = noteChecklistMarkers(previous.content), after = noteChecklistMarkers(current.content);
  if (before.length !== after.length || !after.some((item, index) => item.checked !== before[index].checked)) return false;
  let previousEnd = 0, currentEnd = 0;
  for (let index = 0; index < after.length; index++) {
    if (previous.content.slice(previousEnd, before[index].offset) !== current.content.slice(currentEnd, after[index].offset)) return false;
    previousEnd = before[index].end;
    currentEnd = after[index].end;
  }
  return previous.content.slice(previousEnd) === current.content.slice(currentEnd);
}

/** 版本倒序，找出最近一次真实用户编辑；纯勾选留在比较范围内。 */
export function lastOwnNoteEdit(versions: TaskNoteVersion[]) {
  return versions.find((item, index) => item.actor === "user" && item.kind !== "baseline"
    && (!versions[index + 1] || !isCheckboxOnly(versions[index + 1], item)));
}
