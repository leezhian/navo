import { opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { ProjectFiles } from "./projectFiles";

const MAX_DIRECTORIES = 128;
const MAX_ENTRIES = 1500;
const MAX_DEPTH = 6;
const IGNORED = new Set(["node_modules", "target", "dist", "build", "out", "venv", "__pycache__"]);

function staticPrefix(pattern: string) {
  const segments = pattern.split("/");
  const wildcard = segments.findIndex((segment) => /[*?{[(!]/.test(segment));
  return segments.slice(0, wildcard < 0 ? segments.length : wildcard).join("/");
}

export async function workspaceDirectories(files: ProjectFiles, patterns: string[]) {
  const included = patterns.filter((pattern) => !pattern.startsWith("!"));
  const excluded = patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1));
  if (!included.length) return [];
  const prefixes = included.map(staticPrefix);
  const queue = [{ directory: "", depth: 0 }];
  const found: string[] = [];
  let visited = 0, entries = 0;
  for (const next of queue) {
    if (++visited > MAX_DIRECTORIES || entries >= MAX_ENTRIES) { files.warn("workspaces", "limitReached"); break; }
    try {
      const directory = path.join(files.root, next.directory);
      if (await realpath(directory) !== directory) continue;
      for await (const entry of await opendir(directory)) {
        if (++entries > MAX_ENTRIES) { files.warn("workspaces", "limitReached"); break; }
        if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
        const relative = path.posix.join(next.directory, entry.name);
        if (!prefixes.some((prefix) => !prefix || relative === prefix || relative.startsWith(prefix + "/") || prefix.startsWith(relative + "/"))) continue;
        if (excluded.some((pattern) => path.posix.matchesGlob(relative, pattern))) continue;
        if (included.some((pattern) => path.posix.matchesGlob(relative, pattern))) found.push(relative);
        const mayContainChildren = included.some((pattern) => pattern.includes("**") || pattern.split("/").length > relative.split("/").length);
        if (mayContainChildren) {
          if (next.depth + 1 < MAX_DEPTH) queue.push({ directory: relative, depth: next.depth + 1 });
          else files.warn(relative, "limitReached");
        }
      }
    } catch { files.warn(next.directory || "workspaces", "unreadable"); }
  }
  return found.sort();
}
