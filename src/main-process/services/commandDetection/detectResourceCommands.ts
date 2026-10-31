import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ResourceCommand } from "../../../shared/settingsTypes";
import { RESOURCE_COMMAND_LIMIT } from "../../../shared/settingsTypes";
import type { ResourceCommandDetection } from "../../../shared/resourceCommandDetection";
import { resolveResourcePath } from "../resourcePaths";
import { ProjectFiles } from "./projectFiles";
import { nodePackageManager, nodeWorkspacePatterns, readNodeManifest } from "./nodeProject";
import type { NodeManifest, NodePackageManager } from "./nodeProject";
import { workspaceDirectories } from "./workspaceDirectories";

/** 配置值只作为完整参数传给包管理器，不把项目中的 script 正文拼接为扫描命令。 */
export function quoteCommandArgument(value: string) { return /^[\w./:@-]+$/.test(value) && !value.startsWith("-") ? value : "'" + value.replace(/'/g, "'\\''") + "'"; }

export async function detectResourceCommands(localPath: string): Promise<ResourceCommandDetection> {
  const root = await realpath(resolveResourcePath(localPath));
  if (!(await stat(root)).isDirectory()) throw new Error("INVALID_DIRECTORY");
  const files = new ProjectFiles(root);
  const result: ResourceCommandDetection = { commands: [], warnings: files.warnings };
  function add(directory: string, key: string, script: string) {
    if (result.commands.length >= RESOURCE_COMMAND_LIMIT) { files.warn(directory || ".", "limitReached"); return; }
    const id = "detected-" + createHash("sha256").update(`node\0${directory}\0${key}`).digest("hex").slice(0,24);
    if (result.commands.some((command) => command.id === id)) return;
    const command: ResourceCommand = { id, name: (directory ? `${directory}: ${key}` : key).slice(0,100).trim(),
      script: directory ? `cd -- ${quoteCommandArgument(directory)} && ${script}` : script, runOnWorktreeCreation: false };
    result.commands.push(command);
  }
  function addNodeScripts(directory: string, manifest: NodeManifest, manager: NodePackageManager | null) {
    if (!manager) return;
    for (const [name, script] of Object.entries(manifest.scripts ?? {})) {
      const controlCharacters = Array.from(name).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
      if (!name.trim() || name.length > 100 || /^[\s-]/.test(name) || controlCharacters || typeof script !== "string" || !script.trim()) { files.warn(path.posix.join(directory,"package.json"), "invalidManifest"); continue; }
      add(directory, name, `${manager} run ${quoteCommandArgument(name)}`);
    }
  }
  const manifest = await readNodeManifest(files, "");
  const manager = await nodePackageManager(files, "", manifest ?? {});
  if (manifest) addNodeScripts("", manifest, manager);
  const directories = await workspaceDirectories(files, await nodeWorkspacePatterns(files, manifest));
  for (const directory of directories) {
    if (result.commands.length >= RESOURCE_COMMAND_LIMIT) { files.warn("workspaces", "limitReached"); break; }
    const child = await readNodeManifest(files, directory);
    if (child) addNodeScripts(directory, child, await nodePackageManager(files, directory, child, manager));
  }
  return result;
}
