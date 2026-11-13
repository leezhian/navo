import { RESOURCE_COMMAND_LIMIT } from "../shared/settingsTypes";
import type { ResourceCommand } from "../shared/settingsTypes";
import type { ResourceCommandDetection } from "../shared/resourceCommandDetection";
import { normalizeResourceCommands } from "./resourceConfiguration";

export function normalizeCommandDetection(value: unknown): ResourceCommandDetection | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("INVALID_RESOURCE_COMMAND");
  const result = value as ResourceCommandDetection;
  const commands = normalizeResourceCommands(result.commands);
  if (commands.some((command) => command.runOnWorktreeCreation)
    || !Array.isArray(result.warnings) || result.warnings.length > 50 || result.warnings.some((warning) => !warning
      || typeof warning.source !== "string" || warning.source.length > 1000
      || !["unreadable", "invalidManifest", "ambiguousManager", "unsupportedWorkspace", "limitReached"].includes(warning.code))) throw new Error("INVALID_RESOURCE_COMMAND");
  return { commands, warnings: result.warnings.map(({ source, code }) => ({ source, code })) };
}

/** 稳定的检测 ID 识别已编辑命令；同脚本或同名也不重复插入，不覆盖用户配置。 */
export function mergeDetectedCommands(existing: ResourceCommand[], detected: ResourceCommand[]) {
  const commands = [...existing];
  let limited = false;
  for (const command of detected) {
    if (commands.some((item) => item.id === command.id || item.name === command.name || item.script.trim() === command.script.trim())) continue;
    if (commands.length >= RESOURCE_COMMAND_LIMIT) { limited = true; continue; }
    commands.push({ ...command, runOnWorktreeCreation: false });
  }
  return { commands, limited };
}
