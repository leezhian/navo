import type { Task } from "../domain/tasks";

export const TASK_PROGRESS_STAGES = ["exploration", "development", "review", "done"] as const;
export type TaskProgressStage = typeof TASK_PROGRESS_STAGES[number];

export interface TaskProgress {
  /** 最近一次可靠的 Git / PR 推导结果；无信号时保留已有进度。 */
  evidence: TaskProgressStage;
  /** 上次检查是否取得全部证据；失败时不宣称当前阶段已确认。 */
  settled?: boolean;
  /** 完成后工作区仍有本地改动，提示用户另行检查。 */
  localChanges?: boolean;
  /** 手动指定时记录当时证据，后续真实进展可以接管手动状态。 */
  manual?: { stage: TaskProgressStage; evidence: TaskProgressStage | null };
}

export function isTaskProgressStage(value: unknown): value is TaskProgressStage {
  return TASK_PROGRESS_STAGES.includes(value as TaskProgressStage);
}

/** 旧任务导入仍可缺省进度；提供新字段时须校验，避免保存无法展示的阶段。 */
export function isTaskProgress(value: unknown): value is TaskProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as TaskProgress;
  return isTaskProgressStage(progress.evidence)
    && (progress.settled === undefined || typeof progress.settled === "boolean")
    && (progress.localChanges === undefined || typeof progress.localChanges === "boolean")
    && (progress.manual === undefined || Boolean(progress.manual && isTaskProgressStage(progress.manual.stage)
      && (progress.manual.evidence === null || isTaskProgressStage(progress.manual.evidence))));
}

export function taskProgress(task: Pick<Task, "status" | "archivedFrom" | "progress">): TaskProgress {
  return task.progress ?? { evidence: "exploration", ...((task.status === "DONE" || task.archivedFrom === "DONE")
    ? { manual: { stage: "done", evidence: null } } as const : {}) };
}

export function resolveTaskProgress(progress: TaskProgress) {
  const { evidence, manual } = progress;
  const rank = (stage: TaskProgressStage) => TASK_PROGRESS_STAGES.indexOf(stage);
  // 手动退回阶段后，证据一旦变化便恢复自动；手动提前指定时，等证据追上后再接管。
  const superseded = manual?.evidence != null && (rank(manual.stage) < rank(manual.evidence)
    ? evidence !== manual.evidence : rank(evidence) > rank(manual.evidence) && rank(evidence) >= rank(manual.stage));
  return { stage: manual && !superseded ? manual.stage : evidence, automatic: !manual || superseded };
}

export function taskProgressView(task: Pick<Task, "status" | "archivedFrom" | "progress">) {
  return task.status === "ARCHIVED" ? { stage: "archived" as const, automatic: false } : resolveTaskProgress(taskProgress(task));
}

/** 已手动完成但尚无完成证据时，重新打开回到自动；否则明确退回开发中。 */
export function reopenTaskProgress(progress: TaskProgress): TaskProgress {
  const { stage, automatic } = resolveTaskProgress(progress);
  return stage === "done" && !automatic && progress.evidence !== "done"
    ? { ...progress, manual: undefined }
    : { ...progress, manual: { stage: "development", evidence: progress.evidence } };
}
