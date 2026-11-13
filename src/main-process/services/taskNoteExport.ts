import { writeFile } from "node:fs/promises";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import type { Task } from "../../domain/tasks";
import { TASK_PROMPT_ID } from "../../shared/taskContextTypes";

/** 系统保存面板只使用清理过的文件名；正文原样写入用户明确选定的目标。 */
export function noteExportFilename(title: string) {
  const name = Array.from(title).map((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? "-" : char).join("").replace(/[<>:"/\\|?*]/g, "-").trim().replace(/[. ]+$/, "").slice(0, 120) || "note";
  return /\.md$/i.test(name) ? name : `${name}.md`;
}

export async function exportTaskNote(window: BrowserWindow, task: Task, noteId: string, snapshot?: { title: string; content: string }) {
  const note = snapshot ?? (noteId === TASK_PROMPT_ID
    ? { title: "Prompt", content: task.description ?? "" }
    : task.notes?.find((item) => item.id === noteId));
  if (!note) throw new Error("TASK_NOTE_NOT_FOUND");
  const result = await dialog.showSaveDialog(window, {
    defaultPath: noteExportFilename(note.title),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (result.canceled || !result.filePath || window.isDestroyed()) return false;
  await writeFile(result.filePath, note.content, "utf8");
  return true;
}
