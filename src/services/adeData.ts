import type { Task } from "@/domain/tasks";
import type { IssueItem } from "@/domain/issues";
import { isIssueItem, isTask, parseStoredItems } from "@/utils/adeDataValidation";
import { isLegacyDemoIssue, isLegacyDemoTask } from "@/shared/legacyDemoRecords";

const storagePrefix = import.meta.env.DEV ? "navo:development" : "navo";
const TASKS_STORAGE_KEY = storagePrefix + ":tasks";
const ISSUES_STORAGE_KEY = storagePrefix + ":issues";

function readStoredItems<Item extends { id: string }>(key: string, validate: (value: unknown) => value is Item): Item[] | null {
  try {
    return parseStoredItems(localStorage.getItem(key), validate);
  } catch {
    return [];
  }
}

export function readLegacyTasks(): Task[] {
  const raw = localStorage.getItem(TASKS_STORAGE_KEY);
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("TASK_LEGACY_INVALID"); }
  if (!Array.isArray(value) || !value.every(isTask) || new Set(value.map((task) => task.id)).size !== value.length) throw new Error("TASK_LEGACY_INVALID");
  return value.filter((task) => !isLegacyDemoTask(task));
}

export function clearLegacyTasks() { localStorage.removeItem(TASKS_STORAGE_KEY); }

export function loadIssueItems(): IssueItem[] {
  const items = readStoredItems(ISSUES_STORAGE_KEY, isIssueItem) ?? [];
  const retained = items.filter((item) => !isLegacyDemoIssue(item));
  if (retained.length !== items.length) {
    try { localStorage.setItem(ISSUES_STORAGE_KEY, JSON.stringify(retained)); }
    catch { /* 写入失败时仍不展示 demo，保留原存储以便后续重试。 */ }
  }
  return retained;
}
