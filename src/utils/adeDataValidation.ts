import type { Task } from "@/domain/tasks";
import type { IssueItem } from "@/domain/issues";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasItemFields(value: Record<string, unknown>) {
  return ["id", "title", "projectName", "date"].every((key) => typeof value[key] === "string" && value[key].trim().length > 0)
    && Number.isFinite(Date.parse(String(value.date)));
}

export function isTask(value: unknown): value is Task {
  return isRecord(value) && hasItemFields(value) && ["TODO", "DONE", "ARCHIVED"].includes(String(value.status));
}

export function isIssueItem(value: unknown): value is IssueItem {
  return isRecord(value) && hasItemFields(value)
    && ["PR", "ISSUE"].includes(String(value.group))
    && ["feature", "fix", "refactor", "discussion"].includes(String(value.tag))
    && ["review", "merged", "draft", "todo", "progress", "closed"].includes(String(value.status));
}

/** 无效或重复的数据整体拒绝，避免拖拽时出现重名 key 或修改错误任务。 */
export function parseStoredItems<Item extends { id: string }>(raw: string | null, validate: (value: unknown) => value is Item): Item[] | null {
  if (raw === null) return null;
  try {
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items) || !items.every(validate)) return [];
    return new Set(items.map((item) => item.id)).size === items.length ? items : [];
  } catch {
    return [];
  }
}
