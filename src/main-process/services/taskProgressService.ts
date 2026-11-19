import type { Task } from "../../domain/tasks";
import { isTaskProgressStage, reopenTaskProgress, resolveTaskProgress, taskProgress, type TaskProgressStage } from "../../shared/taskProgress";
import { TaskRepository } from "./taskRepository";
import { inspectTaskProgressGit } from "./taskProgressGit";
import { inferTaskProgress } from "./taskProgressEvidence";

/** 只包含影响推导的输入，用于丢弃检查期间已解除／替换资源的旧结果。 */
export function taskProgressInputs(task: Task) {
  return JSON.stringify([task.resources ?? [], task.links ?? [], task.archivedLinks ?? []]);
}

export class TaskProgressService {
  private readonly pending = new Map<string, Promise<Task | null>>();

  constructor(private readonly repository: TaskRepository,
    private readonly inspect = inspectTaskProgressGit,
    private readonly publish: (task: Task) => void = () => undefined) {}

  refresh(id: string): Promise<Task | null> {
    if (typeof id !== "string" || !id) return Promise.reject(new Error("TASK_INVALID"));
    const existing = this.pending.get(id);
    if (existing) return existing;
    const operation = this.refreshTask(id).finally(() => { this.pending.delete(id); });
    this.pending.set(id, operation);
    return operation;
  }

  private async refreshTask(id: string) {
    const snapshot = (await this.repository.load())?.find((task) => task.id === id);
    if (!snapshot || snapshot.status === "ARCHIVED" || (await this.repository.deletionContext(id)).progress.length) return null;
    const workspaces = [];
    // 每个任务顺序检查工作区，跨任务的并发由调用方限制，避免大任务同时启动大量 Git 进程。
    for (const resource of snapshot.resources ?? []) {
      if (resource.mode !== "folder") workspaces.push(await this.inspect(resource).catch(() => null));
    }
    const evidence = inferTaskProgress(snapshot, workspaces);
    let changed = false;
    const task = await this.repository.updateProgress(id, (task) => {
      if (task.status === "ARCHIVED" || taskProgressInputs(task) !== taskProgressInputs(snapshot)) return task;
      const progress = { ...taskProgress(task), evidence: evidence.stage,
        settled: evidence.complete, localChanges: evidence.localChanges };
      if (resolveTaskProgress(progress).automatic) delete progress.manual;
      const status = resolveTaskProgress(progress).stage === "done" ? "DONE" : "TODO";
      changed = JSON.stringify(task.progress) !== JSON.stringify(progress) || task.status !== status;
      return changed ? { ...task, progress, status } : task;
    });
    if (changed && task) this.publish(task);
    return task;
  }

  async setStage(id: string, stage: TaskProgressStage | null | "reopen") {
    if (typeof id !== "string" || !id || (stage !== null && stage !== "reopen" && !isTaskProgressStage(stage))) throw new Error("TASK_INVALID");
    // 使用已展示的证据作为手动操作基线；Git 重新检查在后台进行，不阻塞菜单提交。
    const task = await this.repository.updateProgress(id, (task) => {
      if (task.status === "ARCHIVED") throw new Error("TASK_ARCHIVED");
      const current = taskProgress(task);
      if (stage === "reopen" && resolveTaskProgress(current).stage !== "done") return task;
      const progress = stage === "reopen" ? reopenTaskProgress(current) : { ...current, manual: stage === null ? undefined
        : { stage, evidence: current.settled === true ? current.evidence : null } };
      const status = resolveTaskProgress(progress).stage === "done" ? "DONE" as const : "TODO" as const;
      return { ...task, progress, status };
    });
    this.publish(task);
    return task;
  }
}
