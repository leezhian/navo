import type { ViewSortDirection } from "../domain/viewSort";

/** 属性相同时按标识稳定排序，避免切换状态或刷新后位置随机变化。 */
export function compareViewValues(left: string | number, right: string | number, direction: ViewSortDirection, leftId: string, rightId: string) {
  const compared = typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  return (direction === "asc" ? compared : -compared) || leftId.localeCompare(rightId);
}
