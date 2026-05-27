import type { DiffLine } from "@/domain/types";

export interface SplitDiffRow {
  id: string;
  newLine: DiffLine | null;
  oldLine: DiffLine | null;
}

export function getUnifiedLineClassName(type: DiffLine["type"]) {
  const base = "grid min-h-7 grid-cols-[46px_46px_minmax(0,1fr)]";
  if (type === "add") {
    return `${base} bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200`;
  }
  if (type === "delete") {
    return `${base} bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200`;
  }
  return base;
}

export function getSplitCellClassName(type: DiffLine["type"] | undefined, side: "old" | "new") {
  const base = `grid min-h-7 min-w-0 grid-cols-[52px_minmax(0,1fr)] ${side === "old" ? "border-r" : ""}`;
  if (type === "add") {
    return `${base} bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200`;
  }
  if (type === "delete") {
    return `${base} bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200`;
  }
  return base;
}

export function pairSplitLines(lines: DiffLine[]) {
  const rows: SplitDiffRow[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    // Git 通常把一次修改表示为连续的删除行和新增行，分栏视图需要把它们配成同一行。
    if (line.type === "delete" && nextLine?.type === "add") {
      rows.push({ id: `${line.id}-${nextLine.id}`, oldLine: line, newLine: nextLine });
      index += 1;
    } else if (line.type === "delete") {
      rows.push({ id: line.id, oldLine: line, newLine: null });
    } else if (line.type === "add") {
      rows.push({ id: line.id, oldLine: null, newLine: line });
    } else {
      rows.push({ id: line.id, oldLine: line, newLine: line });
    }
  }

  return rows;
}
