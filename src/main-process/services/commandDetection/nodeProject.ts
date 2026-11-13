import path from "node:path";
import { ProjectFiles } from "./projectFiles";

export type NodePackageManager = "npm" | "pnpm" | "yarn" | "bun";
export interface NodeManifest { scripts?: Record<string, unknown>; packageManager?: unknown; workspaces?: unknown }
const MANAGERS: NodePackageManager[] = ["npm", "pnpm", "yarn", "bun"];

export async function readNodeManifest(files: ProjectFiles, directory: string): Promise<NodeManifest | null> {
  const source = path.posix.join(directory, "package.json");
  const content = await files.text(source);
  if (content === null) return null;
  try {
    const manifest: NodeManifest = JSON.parse(content);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error();
    if (manifest.scripts !== undefined && (!manifest.scripts || typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts))) throw new Error();
    return manifest;
  } catch { files.warn(source, "invalidManifest"); return null; }
}

export async function nodePackageManager(files: ProjectFiles, directory: string, manifest: NodeManifest, inherited?: NodePackageManager | null): Promise<NodePackageManager | null> {
  const source = path.posix.join(directory, "package.json");
  if (manifest.packageManager !== undefined) {
    const declared = typeof manifest.packageManager === "string" ? /^(npm|pnpm|yarn|bun)@\d[^\s]*$/.exec(manifest.packageManager)?.[1] : undefined;
    if (declared) return declared as NodePackageManager;
    files.warn(source, "ambiguousManager"); return null;
  }
  if (inherited !== undefined) return inherited;
  const found: NodePackageManager[] = [];
  const lockfiles = { npm: ["package-lock.json", "npm-shrinkwrap.json"], pnpm: ["pnpm-lock.yaml", "pnpm-workspace.yaml"], yarn: ["yarn.lock"], bun: ["bun.lock", "bun.lockb"] };
  for (const manager of MANAGERS) {
    for (const name of lockfiles[manager]) if (await files.exists(path.posix.join(directory, name))) { found.push(manager); break; }
  }
  if (found.length > 1) { files.warn(source, "ambiguousManager"); return null; }
  return found[0] ?? "npm";
}

/** 首版读取 package.json workspaces 与 pnpm 的普通 packages 字符串列表；复杂 YAML 明确提示跳过。 */
export async function nodeWorkspacePatterns(files: ProjectFiles, manifest: NodeManifest | null) {
  let values: unknown[] = [];
  if (manifest?.workspaces !== undefined) {
    const workspaces = manifest.workspaces;
    const patterns = Array.isArray(workspaces) ? workspaces : workspaces && typeof workspaces === "object" && "packages" in workspaces ? workspaces.packages : undefined;
    if (Array.isArray(patterns)) values = patterns;
    else files.warn("package.json", "unsupportedWorkspace");
  }
  const yaml = await files.text("pnpm-workspace.yaml");
  if (yaml !== null) {
    let inPackages = false;
    for (const line of yaml.split(/\r?\n/)) {
      if (/^packages:\s*(?:#.*)?$/.test(line)) { inPackages = true; continue; }
      if (/^packages:/.test(line)) { files.warn("pnpm-workspace.yaml", "unsupportedWorkspace"); continue; }
      if (/^\S/.test(line) && !line.startsWith("#")) inPackages = false;
      if (!inPackages || /^\s*(?:#.*)?$/.test(line)) continue;
      const match = /^\s+-\s+(?:'([^']+)'|"([^"\\]+)"|([^\s#'"&*{}[\]]\S*?))\s*(?:#.*)?$/.exec(line);
      if (match) values.push(match[1] ?? match[2] ?? match[3]);
      else files.warn("pnpm-workspace.yaml", "unsupportedWorkspace");
    }
  }
  const patterns: string[] = [];
  for (const value of values) {
    const pattern = typeof value === "string" ? value.replace(/^!/, "").replace(/\/$/, "") : "";
    if (!pattern || pattern.length > 300 || pattern.startsWith("/") || pattern.split("/").includes("..") || /[\\\0\r\n]/.test(pattern)) { files.warn("workspaces", "unsupportedWorkspace"); continue; }
    patterns.push((typeof value === "string" && value.startsWith("!") ? "!" : "") + pattern);
  }
  return patterns;
}
