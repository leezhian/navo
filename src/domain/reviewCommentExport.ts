import type { FileDiffMetadata, Hunk } from "@pierre/diffs";
import type { DiffFile } from "./types";

/** 导出模板使用的 diff 侧，与本地评论 side 取值一致。 */
export type DiffCommentExportSide = "deletions" | "additions";

export interface DiffCommentExportItem {
  /** 评论目标文件的展示路径。 */
  filePath: string;
  /** 评论所在 diff 侧；与本地评论 side 一致。 */
  side: DiffCommentExportSide;
  /** 评论锚定的行号。 */
  lineNumber: number;
  /** 已保存的评论正文。 */
  body: string;
  /** 用于定位的局部 unified diff 文本（不含 diff --git 头）。 */
  hunk: string;
}

const EXPORT_INTRO =
  "Apply each comment below. Prefer Hunk over Line if they disagree. Only change what comments ask.";

/**
 * 将已保存的 diff 评论格式化为通用 Agent 粘贴模板。
 * 字段对齐 Codex 审查评论结构，但去掉产品绑定措辞。
 */
export function formatDiffCommentsExport(comments: DiffCommentExportItem[]): string {
  const sections = [
    "# Diff comments",
    "",
    EXPORT_INTRO,
    "",
  ];

  comments.forEach((comment, index) => {
    sections.push(`## Comment ${index + 1}`);
    sections.push(`File: ${comment.filePath}`);
    sections.push(`Side: ${toExportSide(comment.side)}`);
    sections.push(`Line: ${comment.lineNumber}`);
    sections.push("Hunk:");
    sections.push("```diff");
    sections.push(comment.hunk.trimEnd());
    sections.push("```");
    sections.push("Comment:");
    sections.push(comment.body.trim());
    sections.push("");
  });

  return sections.join("\n").trimEnd() + "\n";
}

/** 把本地评论侧映射为模板里的 new/old。 */
export function toExportSide(side: DiffCommentExportSide): "new" | "old" {
  return side === "additions" ? "new" : "old";
}

/**
 * 从 Diff 文件中截取覆盖目标行的 hunk；找不到时退化为单行 snippet。
 */
export function extractHunkForComment(
  file: DiffFile,
  side: DiffCommentExportSide,
  lineNumber: number,
): string {
  const pierreFile = file.pierreFile;
  const matchedHunk = pierreFile.hunks.find((hunk) => hunkContainsLine(hunk, side, lineNumber));

  if (matchedHunk) {
    return formatHunkAsUnifiedDiff(pierreFile, matchedHunk);
  }

  return formatFallbackSnippet(pierreFile, side, lineNumber);
}

function hunkContainsLine(hunk: Hunk, side: DiffCommentExportSide, lineNumber: number) {
  if (side === "additions") {
    return lineNumber >= hunk.additionStart && lineNumber < hunk.additionStart + hunk.additionCount;
  }

  return lineNumber >= hunk.deletionStart && lineNumber < hunk.deletionStart + hunk.deletionCount;
}

function formatHunkAsUnifiedDiff(file: FileDiffMetadata, hunk: Hunk) {
  const headerBase =
    hunk.hunkSpecs ??
    `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@`;
  const header = hunk.hunkContext ? `${headerBase} ${hunk.hunkContext}` : headerBase;
  const lines = [header];

  for (const content of hunk.hunkContent) {
    if (content.type === "context") {
      for (let index = 0; index < content.lines; index += 1) {
        const text =
          cleanDiffLine(file.additionLines[content.additionLineIndex + index]) ??
          cleanDiffLine(file.deletionLines[content.deletionLineIndex + index]) ??
          "";
        lines.push(` ${text}`);
      }
      continue;
    }

    for (let index = 0; index < content.deletions; index += 1) {
      lines.push(`-${cleanDiffLine(file.deletionLines[content.deletionLineIndex + index]) ?? ""}`);
    }

    for (let index = 0; index < content.additions; index += 1) {
      lines.push(`+${cleanDiffLine(file.additionLines[content.additionLineIndex + index]) ?? ""}`);
    }
  }

  return lines.join("\n");
}

function formatFallbackSnippet(file: FileDiffMetadata, side: DiffCommentExportSide, lineNumber: number) {
  const sourceLines = side === "additions" ? file.additionLines : file.deletionLines;
  // Pierre 行号从 1 起；数组下标从 0 起。找不到精确映射时给空内容，仍保留侧与行号线索。
  const text = cleanDiffLine(sourceLines[lineNumber - 1]) ?? "";
  const prefix = side === "additions" ? "+" : "-";
  return `@@ comment line ${lineNumber} @@\n${prefix}${text}`;
}

function cleanDiffLine(value: string | undefined) {
  if (value == null) {
    return undefined;
  }

  return value.replace(/\r?\n$/, "");
}
