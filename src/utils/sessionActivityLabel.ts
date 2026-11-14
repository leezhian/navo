import type { TaskSession, TaskSessionPhase, TaskSessionStatus } from "@/shared/taskSessionTypes";

/** 运行相位的固定文案；等待原因由调用方单独展示，避免和相位行重复。 */
export function sessionPhaseKey(phase: TaskSessionPhase) {
  switch (phase) {
    case "answering": return "tasks:runtime.phase.answering" as const;
    case "reasoning": return "tasks:runtime.phase.reasoning" as const;
    case "executingTool": return "tasks:runtime.phase.executingTool" as const;
    case "waitingModel": return "tasks:runtime.phase.waitingModel" as const;
    case "idle": return "tasks:runtime.phase.idle" as const;
    case "waitingPermission": return "tasks:runtime.phase.waitingPermission" as const;
  }
}

export function sessionStatusKey(status: TaskSessionStatus) {
  switch (status) {
    case "starting": return "tasks:runtime.status.starting" as const;
    case "running": return "tasks:runtime.status.running" as const;
    case "stopped": return "tasks:runtime.status.stopped" as const;
    case "failed": return "tasks:runtime.status.failed" as const;
  }
}

/** 运行中且有工具名时，状态行使用带原因的文案。 */
export function sessionActivityText(session: Pick<TaskSession, "status" | "phase" | "waitingReason">) {
  if (session.status === "running" && session.phase === "waitingPermission" && session.waitingReason) {
    return { key: "tasks:runtime.phase.waitingPermissionWithReason" as const, reason: session.waitingReason };
  }
  if (session.status === "running" && session.phase) return { key: sessionPhaseKey(session.phase) };
  return { key: sessionStatusKey(session.status) };
}

/** 只把已知启动错误码换成界面文案，不把原始异常文本放进悬停或通知。 */
export function sessionErrorMessageKey(code: string | undefined) {
  if (code === "SESSION_MODE_UNSUPPORTED") return "tasks:runtime.modeUnsupported" as const;
  if (code === "SESSION_OPTION_UNSUPPORTED") return "tasks:runtime.optionUnsupported" as const;
  if (code?.startsWith("SESSION_") || code?.startsWith("AGENT_")) return "tasks:runtime.startFailed" as const;
  return null;
}
