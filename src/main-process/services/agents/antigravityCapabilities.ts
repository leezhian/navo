import type { AgentCapabilities } from "../../../shared/agentCapabilities";
import { cliOptionHelp, label, orderedEfforts, requireCapabilities, unique } from "./agentCapabilityData";
import { runAgentProbe } from "./agentEnvironment";

const MODEL_QUERY_TIMEOUT_MS = 20000;

function optionValues(help: string, flag: string) {
  const values = cliOptionHelp(help, flag).match(/\(([^)]+)\)/)?.[1] ?? "";
  return values.split(/[|,]/).map((value) => label(value.trim())).filter(Boolean);
}

export function parseAntigravityCapabilities(output: string, help: string): AgentCapabilities {
  const efforts = orderedEfforts(optionValues(help, "--effort"));
  const models = unique(output.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf("\t");
    if (separator < 0) return [];
    const id = label(line.slice(0, separator).trim());
    const name = label(line.slice(separator + 1).trim());
    return id && name ? [{ id, name, efforts, defaultEffort: null }] : [];
  }));
  const modes = unique(optionValues(help, "--mode").map((value) => ({ id: value, name: value })));
  // CLI 未标记默认模型或思考等级时，只预选实际列表首项，思考等级保持不覆盖。
  return requireCapabilities({ agentId: "antigravity", models, modes, defaultModelId: models[0]?.id ?? "", defaultModeId: modes[0]?.id ?? "" });
}

export async function readAntigravityCapabilities(binary: string, env: NodeJS.ProcessEnv) {
  const [models, help] = await Promise.all([
    runAgentProbe(binary, ["models"], env, MODEL_QUERY_TIMEOUT_MS),
    runAgentProbe(binary, ["--help"], env),
  ]);
  if (models.code !== 0 || help.code !== 0) throw new Error("AGENT_CAPABILITIES_FAILED");
  return parseAntigravityCapabilities(models.stdout, `${help.stdout}\n${help.stderr}`);
}
