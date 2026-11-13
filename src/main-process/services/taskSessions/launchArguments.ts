import type { TaskAgentSelection } from "../../../shared/agentCapabilities";

/** 所有参数直接传给 exec/PTY，任务文本绝不拼成 Shell 命令。 */
export function agentLaunchArguments(selection: TaskAgentSelection, nativeId: string, prompt: string, resume: boolean, help: string): string[] {
  const args: string[] = [];
  function option(flag: string, value: string) {
    if (!help.includes(flag)) throw new Error("SESSION_OPTION_UNSUPPORTED");
    args.push(flag, value);
  }
  option("--model", selection.modelId);
  if (selection.agentId === "codex") {
    if (selection.modeId !== "default") throw new Error("SESSION_MODE_UNSUPPORTED");
    if (selection.effort) option("--config", `model_reasoning_effort=${JSON.stringify(selection.effort)}`);
    if (resume) { args.unshift("resume");args.push("--", nativeId); }
    else args.push("--", prompt);
  } else if (selection.agentId === "antigravity") {
    option("--mode", selection.modeId);
    if (selection.effort) option("--effort", selection.effort);
    option(resume ? "--conversation" : "--prompt-interactive", resume ? nativeId : prompt);
  } else {
    option("--permission-mode", selection.modeId);
    if (selection.effort) option(selection.agentId === "grok" ? "--reasoning-effort" : "--effort", selection.effort);
    option(resume ? "--resume" : "--session-id", nativeId);
    if (!resume) args.push("--", prompt);
  }
  return args;
}
