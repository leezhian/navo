import type { AgentCapabilities } from "../../../shared/agentCapabilities";

export type CapabilityData = Record<string, unknown>;
export const object = (value: unknown): CapabilityData => value && typeof value === "object" && !Array.isArray(value) ? value as CapabilityData : {};
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const label = (value: unknown): string => typeof value === "string" && value.length <= 256 && Array.from(value).every((char) => char.charCodeAt(0) >= 32) ? value : "";
export const unique = <Option extends { id: string }>(options: Option[]) => options.filter((option, index) => option.id && options.findIndex((other) => other.id === option.id) === index);

export function requireCapabilities(value: AgentCapabilities) {
  if (!value.models.length || !value.modes.length || !value.models.some((model) => model.id === value.defaultModelId)
    || !value.modes.some((mode) => mode.id === value.defaultModeId)) throw new Error("AGENT_CAPABILITIES_FAILED");
  return value;
}

/** 只截取对应参数的帮助，避免误读后续参数的枚举值。 */
export function cliOptionHelp(help: string, flag: string) {
  const lines = help.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimStart().startsWith(flag + " ") || line.trim() === flag);
  if (start < 0) return "";
  const remaining = lines.slice(start + 1);
  const end = remaining.findIndex((line) => /^\s*(?:--[\w-]+|-[A-Za-z](?:,|\s))/.test(line));
  return [lines[start], ...remaining.slice(0, end < 0 ? undefined : end)].join("\n");
}

/** 已知等级按强度排列，但只保留 CLI 实际返回的值，不填充缺失档位。 */
export function orderedEfforts(values: string[]) {
  const efforts = [...new Set(values.filter(Boolean))];
  const order = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
  return efforts.every((effort) => order.includes(effort)) ? efforts.sort((left, right) => order.indexOf(left) - order.indexOf(right)) : efforts;
}
