import type { TaskNoteComment } from "@/shared/taskNoteTypes";

/** 原文位置改变但引用仍唯一时重新定位；内容已改或出现歧义时标为过期，不把评论挂到另一段。 */
export function locateNoteComment(content: string, comment: Pick<TaskNoteComment, "startLine" | "endLine" | "quote">) {
  const lines = content.split("\n");
  if (lines.slice(comment.startLine - 1, comment.endLine).join("\n") === comment.quote) return { startLine: comment.startLine, endLine: comment.endLine };
  if (!comment.quote) return null;
  const candidates = lines.flatMap((_, index) => lines.slice(index, index + comment.quote.split("\n").length).join("\n") === comment.quote ? [index + 1] : []);
  return candidates.length === 1 ? { startLine: candidates[0], endLine: candidates[0] + comment.quote.split("\n").length - 1 } : null;
}

export function toggleNoteChecklist(content: string, line: number, checked: boolean) {
  const lines = content.split("\n"), current = lines[line - 1];
  if (current === undefined || !/^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)[ xX](\])/.test(current)) return content;
  lines[line - 1] = current.replace(/^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)[ xX](\])/, `$1${checked ? "x" : " "}$2`);
  return lines.join("\n");
}
