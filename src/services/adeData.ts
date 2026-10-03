import type { Task } from "@/domain/tasks";
import type { IssueItem } from "@/domain/issues";
import { isIssueItem, isTask, parseStoredItems } from "@/utils/adeDataValidation";
import { developmentIssues, developmentTasks } from "./adeDevelopmentData";

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
  if (raw === null) return import.meta.env.DEV ? developmentTasks : [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("TASK_LEGACY_INVALID"); }
  if (!Array.isArray(value) || !value.every(isTask) || new Set(value.map((task) => task.id)).size !== value.length) throw new Error("TASK_LEGACY_INVALID");
  return value;
}

export function clearLegacyTasks() { localStorage.removeItem(TASKS_STORAGE_KEY); }

export function loadIssueItems(): IssueItem[] {
  return readStoredItems(ISSUES_STORAGE_KEY, isIssueItem) ?? (import.meta.env.DEV ? developmentIssues : []);
}
