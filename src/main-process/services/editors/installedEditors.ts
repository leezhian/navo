import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { InstalledEditor } from "../../../shared/workspaceOpenTypes";
import { editorCatalog, type EditorDefinition } from "./editorCatalog";

const execute = promisify(execFile);
export const EDITOR_CACHE_MS = 30 * 60 * 1000;
export const EDITOR_RETRY_MS = 60 * 1000;
export interface DetectedEditor extends InstalledEditor { appPath: string; }

async function detectedEditor(filename: string, definition: EditorDefinition): Promise<DetectedEditor> {
  const appPath = await realpath(filename);
  return { id: definition.id, name: definition.name, appPath };
}

export async function matchesEditorBundle(filename: string, definition: EditorDefinition) {
  if (!path.isAbsolute(filename) || !filename.endsWith(".app")) return false;
  try {
    if (!(await stat(filename)).isDirectory()) return false;
    const { stdout } = await execute("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", path.join(filename, "Contents", "Info.plist")], { timeout: 3000, maxBuffer: 4096 });
    return definition.bundleIds.includes(stdout.trim());
  } catch { return false; }
}

async function applicationPaths() {
  const result: string[] = [];
  for (const root of ["/Applications", path.join(os.homedir(), "Applications")]) {
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.name.endsWith(".app")) result.push(path.join(root, entry.name));
        else if (entry.isDirectory()) {
          try { for (const nested of await readdir(path.join(root, entry.name))) if (nested.endsWith(".app")) result.push(path.join(root, entry.name, nested)); }
          catch { /* 非应用目录或不可读目录不参与检测。 */ }
        }
      }
    } catch { /* 用户应用目录可能尚不存在。 */ }
  }
  return result;
}

/** 只读应用目录与 Spotlight，绝不为了检测而启动 IDE。 */
export async function detectInstalledEditors(): Promise<DetectedEditor[]> {
  if (process.platform !== "darwin") return [];
  const applications = await applicationPaths();
  const detected = await Promise.all(editorCatalog.map(async (definition) => {
    const candidates = applications.filter((filename) => definition.appNames.some((name) => path.basename(filename) === name + ".app" || path.basename(filename).startsWith(name + " ")));
    for (const filename of candidates) if (await matchesEditorBundle(filename, definition)) return detectedEditor(filename, definition);
    for (const bundleId of definition.bundleIds) {
      try {
        const { stdout } = await execute("/usr/bin/mdfind", ["kMDItemCFBundleIdentifier == '" + bundleId + "'"], { timeout: 3000, maxBuffer: 64 * 1024 });
        for (const filename of stdout.trim().split("\n").filter(Boolean)) if (await matchesEditorBundle(filename, definition)) return detectedEditor(filename, definition);
      } catch { /* 索引不可用时仍保留普通应用目录的检测结果。 */ }
    }
    return null;
  }));
  return detected.filter((editor): editor is DetectedEditor => editor !== null);
}

export class InstalledEditorsCache {
  private cached: DetectedEditor[] = [];
  private refreshAfter = 0;
  private pending: Promise<DetectedEditor[]> | null = null;
  constructor(private readonly detect = detectInstalledEditors, private readonly now = Date.now) {}
  list(): Promise<DetectedEditor[]> {
    if (this.pending) return this.pending;
    if (this.now() < this.refreshAfter) return Promise.resolve(this.cached);
    this.pending = this.detect().then((editors) => { this.cached = editors; this.refreshAfter = this.now() + EDITOR_CACHE_MS; return editors; })
      .catch(() => { this.refreshAfter = this.now() + EDITOR_RETRY_MS; return this.cached; }).finally(() => { this.pending = null; });
    return this.pending;
  }
  find(id: InstalledEditor["id"]) { return this.cached.find((editor) => editor.id === id); }
  invalidate() { this.refreshAfter = 0; }
}
