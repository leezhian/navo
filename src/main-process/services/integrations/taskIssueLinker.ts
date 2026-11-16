import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Task } from "../../../domain/tasks";
import type { IssueItem } from "../../../domain/issues";
import type { AddTaskResourcesInput } from "../../../shared/taskResourceTypes";
import { openAppDatabase } from "../appDatabase";
import { matchingAutolinkPullRequests, matchingWorktreesForPullRequest, matchingPullRequestForWorktree } from "./autolink";
import type { WorktreeIdentity } from "./autolink";
import { buildIssueBodyNote, existingIssueNote } from "./issueBodyNote";

export interface TaskIssueLinkerDeps {
  filename: string;
  namespace: string;
  loadTasks: () => Promise<Task[]>;
  addResources: (taskId: string, input: AddTaskResourcesInput) => Promise<Task>;
  /** 读取工作区当前分支与远端；失败返回 null，不为此 fetch。 */
  inspectWorktree: (workingPath: string) => Promise<{ branch: string | null; remoteUrl: string | null }>;
  getItem: (id: string, options?: { refresh?: boolean }) => Promise<IssueItem | null>;
  cachedPullRequests: () => Promise<IssueItem[]>;
  viewerLogin: (item: IssueItem) => Promise<string | null>;
  publish?: (task: Task) => void;
}

export type IssueNoteOutcome = "created" | "exists" | "skipped" | "failed";

/** PR/Issue 与任务的联动：自动关联、解除排除、正文笔记与 Worktree 匹配。 */
export class TaskIssueLinker {
  private running: Promise<Task[]> | null = null;
  constructor(private readonly deps: TaskIssueLinkerDeps) {}

  private async access<T>(operation: (database: DatabaseSync) => T): Promise<T> {
    const database = await openAppDatabase(this.deps.filename);
    try { return operation(database); } finally { database.close(); }
  }

  async exclusions(): Promise<Set<string>> {
    return this.access((database) => new Set(database.prepare("SELECT task_id,issue_id FROM issue_autolink_exclusions WHERE namespace=?")
      .all(this.deps.namespace).map((row) => `${String(row.task_id)}:${String(row.issue_id)}`)));
  }

  /** 手动解除 PR 后记录排除，之后不再自动关联回该任务。 */
  async rememberDetached(taskId: string, pullRequestIds: string[]) {
    if (!pullRequestIds.length) return;
    await this.access((database) => {
      const statement = database.prepare("INSERT OR IGNORE INTO issue_autolink_exclusions(namespace,task_id,issue_id) VALUES(?,?,?)");
      for (const id of pullRequestIds) statement.run(this.deps.namespace, taskId, id);
    });
  }

  /** 用户再次手动添加时清除排除。 */
  async forgetDetached(taskId: string, ids: string[]) {
    if (!ids.length) return;
    await this.access((database) => {
      const statement = database.prepare("DELETE FROM issue_autolink_exclusions WHERE namespace=? AND task_id=? AND issue_id=?");
      for (const id of ids) statement.run(this.deps.namespace, taskId, id);
    });
  }

  async worktrees(tasks?: Task[]): Promise<WorktreeIdentity[]> {
    const list = tasks ?? await this.deps.loadTasks();
    const result: WorktreeIdentity[] = [];
    for (const task of list) {
      if (task.status === "ARCHIVED") continue;
      for (const resource of task.resources ?? []) {
        const info = await this.deps.inspectWorktree(resource.workingPath).catch(() => ({ branch: null, remoteUrl: null }));
        if (!info.branch) continue;
        result.push({ taskId: task.id, resourceId: resource.resourceId, name: resource.name, workingPath: resource.workingPath, branch: info.branch, remoteUrl: info.remoteUrl });
      }
    }
    return result;
  }

  /** 刷新 PR 后执行；同一时间只跑一次。只添加，从不移除或替换。 */
  autolink(pullRequests: IssueItem[]): Promise<Task[]> {
    if (this.running) return this.running;
    this.running = this.runAutolink(pullRequests).finally(() => { this.running = null; });
    return this.running;
  }

  private async runAutolink(pullRequests: IssueItem[]) {
    const tasks = await this.deps.loadTasks();
    const worktrees = await this.worktrees(tasks);
    if (!worktrees.length) return [];
    const excluded = await this.exclusions();
    const byLogin = new Map<string, IssueItem[]>();
    for (const pullRequest of pullRequests) {
      if (pullRequest.group !== "PR" || pullRequest.source === "local") continue;
      const login = await this.deps.viewerLogin(pullRequest);
      if (!login) continue;
      byLogin.set(login, [...(byLogin.get(login) ?? []), pullRequest]);
    }
    const additions = new Map<string, IssueItem[]>();
    for (const [login, items] of byLogin) {
      for (const match of matchingAutolinkPullRequests(items, worktrees, login, excluded)) {
        const task = tasks.find((item) => item.id === match.taskId);
        if (!task || task.status === "ARCHIVED") continue;
        const known = [...(task.links ?? []), ...(task.archivedLinks ?? [])].some((link) => link.id === match.pullRequest.id);
        if (known) continue;
        const list = additions.get(match.taskId) ?? [];
        if (!list.some((item) => item.id === match.pullRequest.id)) list.push({ ...match.pullRequest, autoLinked: true });
        additions.set(match.taskId, list);
      }
    }
    const updated: Task[] = [];
    for (const [taskId, links] of additions) {
      try {
        const task = await this.deps.addResources(taskId, { requestId: randomUUID(), links, webLinks: [], notes: [], fileIds: [] });
        this.deps.publish?.(task);
        updated.push(task);
      } catch { /* 任务归档或删除中时跳过，不影响其他任务 */ }
    }
    return updated;
  }

  /** 每个任务的每个 Issue 只生成一次正文笔记；读取失败不影响添加。 */
  async ensureIssueNote(taskId: string, issueId: string): Promise<IssueNoteOutcome> {
    const task = (await this.deps.loadTasks()).find((item) => item.id === taskId);
    if (!task || task.status === "ARCHIVED") return "skipped";
    const link = [...(task.links ?? []), ...(task.archivedLinks ?? [])].find((item) => item.id === issueId);
    if (!link || link.group !== "ISSUE" || link.source === "local") return "skipped";
    const allNotes = [...(task.notes ?? []), ...(task.archivedNotes ?? [])];
    let issue: IssueItem | null = link;
    if (!issue.body) {
      issue = await this.deps.getItem(issueId, { refresh: true }).catch(() => null);
      if (!issue || issue.fetchError || !issue.body) return "failed";
    }
    const note = buildIssueBodyNote(issue, allNotes);
    if (!note) return existingIssueNote(allNotes, issue.id) ? "exists" : "skipped";
    const next = await this.deps.addResources(taskId, { requestId: randomUUID(), links: [], webLinks: [], notes: [note], fileIds: [] });
    this.deps.publish?.(next);
    return "created";
  }

  async afterIssuesAdded(taskId: string, links: IssueItem[]) {
    await this.forgetDetached(taskId, links.filter((link) => link.group === "PR").map((link) => link.id));
    const outcomes: Record<string, IssueNoteOutcome> = {};
    for (const link of links.filter((item) => item.group === "ISSUE" && item.source !== "local")) {
      outcomes[link.id] = await this.ensureIssueNote(taskId, link.id).catch(() => "failed" as const);
    }
    return outcomes;
  }

  async findLink(taskId: string, id: string) {
    const task = (await this.deps.loadTasks()).find((item) => item.id === taskId);
    return [...(task?.links ?? []), ...(task?.archivedLinks ?? [])].find((link) => link.id === id) ?? null;
  }

  async worktreesForPullRequest(taskId: string, pullRequest: IssueItem) {
    const task = (await this.deps.loadTasks()).find((item) => item.id === taskId);
    if (!task) return [];
    return matchingWorktreesForPullRequest(pullRequest, await this.worktrees([task]));
  }

  async pullRequestForWorktree(taskId: string, resourceId: string) {
    const task = (await this.deps.loadTasks()).find((item) => item.id === taskId);
    if (!task) return null;
    const worktree = (await this.worktrees([{ ...task, status: task.status === "ARCHIVED" ? "TODO" : task.status }])).find((item) => item.resourceId === resourceId);
    if (!worktree) return null;
    const linked = (task.links ?? []).filter((link) => link.group === "PR");
    return matchingPullRequestForWorktree(linked, worktree) ?? matchingPullRequestForWorktree(await this.deps.cachedPullRequests(), worktree);
  }
}
