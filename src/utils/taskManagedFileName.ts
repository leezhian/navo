import path from "node:path";
import type { TaskFileRenameRefusal } from "../shared/taskResourceLifecycle";

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const MAX_FILE_NAME = 255;

/** 附件副本改名时保留原扩展名，并拒绝空名、分隔符、系统保留名、过长名称。 */
export function proposedManagedFileName(input: string, originalName: string): { name: string } | { reason: TaskFileRenameRefusal } {
  const trimmed = input.trim();
  if (!trimmed) return { reason: "empty" };
  if (trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) return { reason: "separator" };
  const extension = path.extname(originalName);
  const base = path.extname(trimmed).toLowerCase() === extension.toLowerCase() ? trimmed.slice(0, trimmed.length - extension.length) : trimmed;
  const name = (base.endsWith(".") ? base.slice(0, -1) : base) + extension;
  if (!name || name === extension || name === "." || name === "..") return { reason: "empty" };
  if (/[\\/]/.test(name) || name !== path.basename(name)) return { reason: "separator" };
  if (RESERVED.test(name) || /[<>:"|?*]/.test(name) || name.includes("\0")) return { reason: "reserved" };
  if (Buffer.byteLength(name, "utf8") > MAX_FILE_NAME) return { reason: "too-long" };
  return { name };
}
