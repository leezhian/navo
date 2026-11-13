import type { DiffFile } from "../domain/types";

/** 重命名的新旧路径必须在同一次 Git 操作中处理，避免只撤销新增而留下已暂存删除。 */
export function getReviewFilePaths(files: DiffFile[]): string[] {
  return [...new Set(files.flatMap((file) => {
    const paths = [file.oldPath, file.newPath].filter((value): value is string => Boolean(value));
    return paths.length ? paths : [file.displayPath];
  }))];
}
