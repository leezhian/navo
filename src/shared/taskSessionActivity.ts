import type { AgentId } from "./agentTypes";
import type { TaskSessionPhase } from "./taskSessionTypes";

export interface NativeActivityCapability {
  /** 可由原生结构化记录确认的运行相位；空数组表示只显示进程四态。 */
  phases: TaskSessionPhase[];
  /** 等待时能否给出具体原因（目前仅工具名）。 */
  waitingReason: boolean;
  /** 能否确认“回合完成”时间，用于已读／未读。 */
  reply: boolean;
  /** 信号来源，供 PRD 附录与排查使用。 */
  source: string;
}

/** 各 Agent 能力矩阵：只登记已在本机原生记录中核实过的结构化事件，不扫描终端、不注入 hooks。 */
export const NATIVE_ACTIVITY_CAPABILITIES: Record<AgentId, NativeActivityCapability> = {
  grok: {
    phases: ["answering", "reasoning", "executingTool", "waitingModel", "waitingPermission", "idle"], waitingReason: true, reply: true,
    source: "$GROK_HOME/sessions/<cwd>/<id>/events.jsonl：phase_changed（streaming_text／streaming_reasoning／tool_execution／waiting_for_model／permission_prompt）、turn_started、turn_ended(outcome=completed)、permission_requested(tool_name)、permission_resolved",
  },
  codex: {
    phases: ["answering", "idle"], waitingReason: false, reply: true,
    source: "$CODEX_HOME/state_N.sqlite threads.rollout_path → rollout JSONL：event_msg task_started、task_complete、turn_aborted",
  },
  claude: {
    phases: ["answering", "idle"], waitingReason: false, reply: true,
    source: "$CLAUDE_CONFIG_DIR/projects/<cwd>/<id>.jsonl：非 meta、非工具结果的 user 记录开始回合；system turn_duration 结束回合",
  },
  antigravity: {
    phases: [], waitingReason: false, reply: false,
    source: "transcript.jsonl 无明确回合结束事件，PLANNER_RESPONSE 在一回合内会多次出现，暂只显示进程四态",
  },
};
