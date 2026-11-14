import type { TaskAgentSelection } from "@/shared/agentCapabilities";
import { agentEffortLabel } from "@/utils/taskAgentLabels";

/** 回显本次启动保存的模型、模式和思考等级；缺省思考等级不显示 default 占位。 */
export function sessionLaunchConfig(agent: TaskAgentSelection | undefined) {
  if (!agent) return null;
  const parts = [agent.modelName, agent.modeName, agent.effort ? agentEffortLabel(agent.effort) : ""].map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
