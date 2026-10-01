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

export function loadTasks(): Task[] {
  return readStoredItems(TASKS_STORAGE_KEY, isTask) ?? (import.meta.env.DEV ? developmentTasks : []);
}

export function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // 存储受限时保留当前窗口中的操作结果，不阻断拖动或查看详情。
  }
}

export function loadIssueItems(): IssueItem[] {
  return readStoredItems(ISSUES_STORAGE_KEY, isIssueItem) ?? (import.meta.env.DEV ? developmentIssues : []);
}
