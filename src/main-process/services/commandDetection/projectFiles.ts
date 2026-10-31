import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import type { CommandDetectionWarning, CommandDetectionWarningCode } from "../../../shared/resourceCommandDetection";

const MAX_MANIFEST_BYTES = 1024 * 1024;

/** 仅提供扫描范围内的有限文件读取，不启动语言工具、不加载项目代码。 */
export class ProjectFiles {
  readonly warnings: CommandDetectionWarning[] = [];
  constructor(readonly root: string) {}
  warn(source: string, code: CommandDetectionWarningCode) {
    if (this.warnings.length < 50 && !this.warnings.some((warning) => warning.source === source && warning.code === code)) this.warnings.push({ source, code });
  }
  private async location(relative: string) {
    const filename = path.resolve(this.root, relative);
    const fromRoot = path.relative(this.root, filename);
    if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(".." + path.sep) || path.isAbsolute(fromRoot)) throw new Error("OUTSIDE_PROJECT");
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || await realpath(filename) !== filename) throw new Error("UNSAFE_PROJECT_FILE");
    return filename;
  }
  async exists(relative: string) {
    try { await this.location(relative); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.warn(relative, "unreadable"); return false; }
  }
  async text(relative: string): Promise<string | null> {
    let file;
    try {
      const filename = await this.location(relative);
      file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = await file.stat();
      if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) throw new Error("MANIFEST_TOO_LARGE");
      const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_MANIFEST_BYTES) throw new Error("MANIFEST_TOO_LARGE");
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead)).replace(/^\uFEFF/, "");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.warn(relative, "unreadable");
      return null;
    } finally { await file?.close(); }
  }
}
