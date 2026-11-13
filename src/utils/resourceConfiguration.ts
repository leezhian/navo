import { RESOURCE_COMMAND_LIMIT, RESOURCE_COMMAND_NAME_MAX_LENGTH, RESOURCE_COMMAND_SCRIPT_MAX_LENGTH, RESOURCE_DESCRIPTION_MAX_LENGTH } from "../shared/settingsTypes";
import type { ResourceCommand } from "../shared/settingsTypes";

export function normalizeResourceDescription(value: unknown): string {
  if (typeof value !== "string" || value.length > RESOURCE_DESCRIPTION_MAX_LENGTH || value.includes("\0")) throw new Error("INVALID_RESOURCE_DESCRIPTION");
  return value.trim();
}

export function normalizeResourceCommands(value: unknown): ResourceCommand[] {
  if (!Array.isArray(value) || value.length > RESOURCE_COMMAND_LIMIT) throw new Error("INVALID_RESOURCE_COMMAND");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item.id !== "string" || !/^[\w-]{1,100}$/.test(item.id) || ids.has(item.id)
      || typeof item.name !== "string" || !item.name.trim() || item.name.length > RESOURCE_COMMAND_NAME_MAX_LENGTH || /[\r\n\0]/.test(item.name)
      || typeof item.script !== "string" || !item.script.trim() || item.script.length > RESOURCE_COMMAND_SCRIPT_MAX_LENGTH || item.script.includes("\0")
      || typeof item.runOnWorktreeCreation !== "boolean") throw new Error("INVALID_RESOURCE_COMMAND");
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), script: item.script, runOnWorktreeCreation: item.runOnWorktreeCreation };
  });
}
