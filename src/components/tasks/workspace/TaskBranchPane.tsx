import { useState } from "react";
import { ArrowUpRight, GitBranch, GitCommitHorizontal, ListTree, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskResource } from "@/shared/taskTypes";
import type { CompareMode } from "@/domain/types";
import { useTaskBranch } from "@/hooks/useTaskBranch";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { BranchFileList } from "./BranchFileList";
import "./task-branch.css";

interface TaskBranchPaneProps {
  /** 只读取任务真实关联的 Git 目录，普通文件夹不展示分支栏。 */
  taskId: string;
  resource: TaskResource;
  onClose: () => void;
  /** 使用旧 Diff 的对比模式；点击文件时额外传入完整路径。 */
  onOpenDiff: (mode: CompareMode, filePath?: string, branchName?: string) => void;
}
export function TaskBranchPane({ taskId, resource, onClose, onOpenDiff }: TaskBranchPaneProps) {
  const { t, i18n } = useTranslation(["tasks", "common", "review"]);
  const { snapshot, loading, error, refresh } = useTaskBranch(taskId, resource);
  const [scope, setScope] = useState<"working" | "commits">("working");
  const [filter, setFilter] = useState("");
  const [tree, setTree] = useState(true);
  const modes: CompareMode[] = scope === "working" ? ["unstaged", "staged"] : ["branch"];
  const files = modes.flatMap((mode) => snapshot?.files[mode] ?? []);
  const visible = files.filter((file) => file.path.toLowerCase().includes(filter.trim().toLowerCase()));
  const count = new Set(visible.map((file) => file.path)).size;
  const workingCount = new Set([...(snapshot?.files.unstaged ?? []), ...(snapshot?.files.staged ?? [])].map((file) => file.path)).size;
  const openMode = scope === "commits" ? "branch" : snapshot?.files.unstaged.length || !snapshot?.files.staged.length ? "unstaged" : "staged";
  const branchName = snapshot?.branchName || resource.targetBranch || resource.sourceBranch;
  const openDiff = (mode: CompareMode, filename?: string) => onOpenDiff(mode, filename, branchName);
  const unavailableBase = scope === "commits" && snapshot && !snapshot.baseAvailable;
  return <section className="task-workbench-panel task-branch-pane" aria-label={t("tasks:branch.title")}>
    <header className="task-workbench-panel-heading"><div className="flex min-w-0 items-center gap-2" title={resource.name + " · " + branchName}><GitBranch /><span className="truncate text-xs">{branchName}</span></div>
      <div className="flex shrink-0 items-center gap-1"><IconTooltip label={t("tasks:branch.openDiff")} size="icon-xs" disabled={!snapshot || Boolean(unavailableBase)} onClick={() => openDiff(openMode)}><ArrowUpRight /></IconTooltip><IconTooltip label={t("tasks:branch.close")} size="icon-xs" onClick={onClose}><X /></IconTooltip></div>
    </header>
    <div className="task-branch-controls"><div className="task-branch-segments">
      <button aria-pressed={scope === "working"} onClick={() => setScope("working")}>{t("tasks:branch.working")}<span>{snapshot ? workingCount : ""}</span></button>
      <button aria-pressed={scope === "commits"} onClick={() => setScope("commits")}>{t("tasks:branch.commits")}<span>{snapshot?.baseAvailable ? snapshot.commits.length + (snapshot.hasMoreCommits ? "+" : "") : ""}</span></button>
    </div><IconTooltip label={t(tree ? "tasks:branch.showList" : "tasks:branch.showTree")} size="icon-xs" onClick={() => setTree(!tree)}><ListTree /></IconTooltip></div>
    <label className="task-branch-filter"><Search /><input value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("tasks:branch.filter")} placeholder={t("tasks:branch.filter")} /></label>
    <div className="task-branch-scroll" aria-busy={loading}>
      {error && <div className="task-branch-notice" role="alert">{t("tasks:branch.failed")}<Button variant="ghost" size="sm" onClick={refresh}>{t("common:actions.refresh")}</Button></div>}
      {loading && <div className="space-y-3 p-3" aria-label={t("common:status.loading")}><div className="h-3 rounded bg-muted" /><div className="h-3 w-3/4 rounded bg-muted" /><div className="h-3 w-1/2 rounded bg-muted" /></div>}
      {scope === "working" && Boolean(snapshot?.untrackedCount) && <p className="task-branch-notice">{t("tasks:branch.untracked", { count: snapshot?.untrackedCount ?? 0 })}</p>}
      {unavailableBase && <p className="task-branch-notice">{t("tasks:branch.baseUnavailable")}</p>}
      {scope === "commits" && snapshot?.baseAvailable && <div className="task-branch-commits"><p>{t("tasks:branch.relativeTo", { branch: snapshot.baseBranch })}</p>
        {snapshot.commits.map((commit) => <div className="task-branch-commit" key={commit.sha}><GitCommitHorizontal /><div className="min-w-0"><p className="truncate" title={commit.title}>{commit.title}</p><small>{commit.sha.slice(0, 7)} · {new Date(commit.date).toLocaleDateString(i18n.language)} · {commit.author}</small></div></div>)}
        {!snapshot.commits.length && <p>{t("tasks:branch.noCommits")}</p>}
        {snapshot.hasMoreCommits && <p>{t("tasks:branch.moreCommits")}</p>}
      </div>}
      {snapshot && !unavailableBase && <><div className="task-branch-summary"><span>{t("tasks:branch.fileCount", { count })}</span><span className="task-branch-delta"><span className="text-green-600 dark:text-green-400">+{visible.reduce((total, file) => total + file.additions, 0)}</span><span className="text-red-600 dark:text-red-400">−{visible.reduce((total, file) => total + file.deletions, 0)}</span></span></div>
        {modes.map((mode) => {
          const matching = snapshot.files[mode].filter((file) => file.path.toLowerCase().includes(filter.trim().toLowerCase()));
          if (!matching.length) return null;
          return <div key={mode}>{scope === "working" && <p className="task-branch-scope">{t(mode === "staged" ? "tasks:branch.staged" : "tasks:branch.unstaged")}</p>}<BranchFileList files={matching} tree={tree} onSelect={(filename) => openDiff(mode, filename)} /></div>;
        })}
        {!count && <p className="task-branch-empty">{t(filter ? "tasks:branch.noMatches" : "tasks:branch.noChanges")}</p>}
      </>}
    </div>
  </section>;
}
