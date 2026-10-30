import type { WebContents } from "electron";
import type { Task } from "../../domain/tasks";
import { TaskInitializationRepository } from "./taskInitializationRepository";
import type { StoredInitializationStep } from "./taskInitializationRepository";
import type { TaskSessionService } from "./taskSessions/taskSessionService";
import { realpath, stat } from "node:fs/promises";

/** 顺序等待发生在会话队列之外，否则 PTY 退出回调无法取得同一队列。 */
export class TaskInitializationService {
  private runs = new Map<string, { promise: Promise<boolean>; cancelled: boolean }>();
  private closing = false;
  constructor(private readonly repository: TaskInitializationRepository, private readonly sessions: TaskSessionService,
    private readonly loadTask: (id: string) => Promise<Task>, private readonly changed: (task: Task) => void) {}
  isRunning(taskId: string) { return this.runs.has(taskId); }
  run(taskId: string, owner: WebContents, retry = false): Promise<boolean> {
    const existing = this.runs.get(taskId);
    // 追加工作区可能发生在当前计划执行期间；结束后补查新计划，不重试已有失败。
    if (existing) return existing.promise.then((success) => success ? this.run(taskId, owner) : false);
    if (this.closing) return Promise.resolve(false);
    const run = { cancelled: false, promise: Promise.resolve(false) };
    run.promise = this.execute(taskId, owner, retry, () => run.cancelled || this.closing || owner.isDestroyed()).finally(() => this.runs.delete(taskId));
    this.runs.set(taskId, run);
    return run.promise;
  }
  private async publish(taskId: string) { this.changed(await this.loadTask(taskId)); }
  private async execute(taskId: string, owner: WebContents, retry: boolean, cancelled: () => boolean) {
    const plan = await this.repository.list(taskId);
    if (!retry && plan.some((step) => step.status === "failed" || step.status === "running")) return false;
    for (const step of plan) {
      if (step.status === "succeeded") continue;
      if (cancelled()) return false;
      const task = await this.loadTask(taskId);
      if (task.status === "ARCHIVED" || !task.resources?.some((resource) => resource.resourceId === step.resourceId)) return false;
      step.status = "running"; delete step.exitCode;
      await this.repository.save(taskId, step);
      let code: number | null = null;
      try {
        await this.publish(taskId);
        const resource = task.resources.find((item) => item.resourceId === step.resourceId);
        if (!resource?.ownership) throw new Error("TASK_RESOURCE_CHANGED");
        const directory = await stat(resource.workingPath);
        if (await realpath(resource.workingPath) !== resource.ownership.path || `${directory.dev}:${directory.ino}` !== resource.ownership.directoryId) throw new Error("TASK_RESOURCE_CHANGED");
        if (!cancelled()) code = await this.runCommand(taskId, step, owner);
      }
      finally {
        step.status = code === 0 ? "succeeded" : "failed";
        if (code !== null) step.exitCode = code;
        await this.repository.save(taskId, step);
        await this.publish(taskId);
      }
      if (code !== 0 || cancelled()) return false;
    }
    return !cancelled();
  }
  private async runCommand(taskId: string, step: StoredInitializationStep, owner: WebContents) {
    let finish!: (code: number | null) => void;
    const completed = new Promise<number | null>((resolve) => { finish = resolve; });
    await this.sessions.start({ taskId, kind: "shell", resourceId: step.resourceId }, owner, false, {
      command: { id: step.id, name: step.name, script: step.script, runOnWorktreeCreation: true }, finished: finish,
    });
    return completed;
  }
  async cancel(taskId: string) {
    const run = this.runs.get(taskId);
    if (!run) return;
    run.cancelled = true;
    // 与启动串行：即使取消时命令尚在排队，也会在这里被停止。
    await this.sessions.stopInitialization(taskId);
    await run.promise.catch(() => undefined);
  }
  async shutdown() { this.closing = true; await Promise.all([...this.runs.keys()].map((id) => this.cancel(id))); }
}
