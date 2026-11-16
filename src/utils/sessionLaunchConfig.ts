import type { TaskAgentSelection } from "@/shared/agentCapabilities";
import { agentEffortLabel } from "@/utils/taskAgentLabels";

/** 回显本次启动保存的模型、模式和思考等级；缺省思考等级不显示 default 占位。 */
export function sessionLaunchConfig(agent: TaskAgentSelection | undefined) {
  if (!agent) return null;
  // 旧会话记录可能缺省模型或模式字段，整行省略而不是让工作台崩溃。
  const parts = [agent.modelName?.trim(), agent.modeName?.trim(), agent.effort ? agentEffortLabel(agent.effort) : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
