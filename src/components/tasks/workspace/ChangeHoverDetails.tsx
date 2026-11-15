import { useState } from "react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { TaskResource } from "@/shared/taskTypes";
import type { ChangeGitLineStats, ChangeGitOperationKind, ChangeGitStatus } from "@/shared/changeGitStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortenPath } from "@/utils/taskSessionWorkspace";
import { useChangeGitStatus } from "@/hooks/useChangeGitStatus";

interface ChangeHoverDetailsProps {
  /** 只通过任务和工作区标识读取 Git 状态，不向主进程传递路径。 */
  taskId: string;
  resource: TaskResource;
  /** 保留原按钮的点击与右键行为。 */
  children: ReactElement;
}

interface StatusRow {
  key: string;
  text: string;
  delta?: ChangeGitLineStats | null;
}

type ChangeHoverTranslate = ReturnType<typeof useTranslation<["tasks"]>>["t"];

function LineDelta({ stats }: { stats: ChangeGitLineStats }) {
  if (stats.additions <= 0 && stats.deletions <= 0) return null;
  return <span className="task-branch-delta shrink-0 tabular-nums">
    {stats.additions > 0 && <span className="text-green-400">+{stats.additions}</span>}
    {stats.deletions > 0 && <span className="text-red-400">−{stats.deletions}</span>}
  </span>;
}

function operationLabel(kind: ChangeGitOperationKind, t: ChangeHoverTranslate) {
  if (kind === "rebase") return t("tasks:changesHover.operation.rebase");
  if (kind === "merge") return t("tasks:changesHover.operation.merge");
  if (kind === "cherryPick") return t("tasks:changesHover.operation.cherryPick");
  return t("tasks:changesHover.operation.revert");
}

function statusRows(status: ChangeGitStatus | null, loading: boolean, t: ChangeHoverTranslate): StatusRow[] {
  if (loading && !status) return [{ key: "loading", text: t("tasks:changesHover.loading") }];
  if (!status) return [];
  if (status.missingDirectory) return [{ key: "missing", text: t("tasks:changesHover.missingDirectory") }];
  if (status.failed) return [{ key: "failed", text: t("tasks:changesHover.failed") }];
  const rows: StatusRow[] = [];
  if (status.operation) {
    const operation = operationLabel(status.operation.kind, t);
    rows.push({
      key: "operation",
      text: status.operation.conflicts > 0
        ? t("tasks:changesHover.operationPausedConflicts", { operation, count: status.operation.conflicts })
        : t("tasks:changesHover.operationPaused", { operation }),
    });
  }
  if (status.isDetached) rows.push({ key: "detached", text: t("tasks:changesHover.detached", { sha: status.branchName }) });
  if (status.sinceSource) {
    rows.push({
      key: "since",
      text: status.sinceSource.commits > 0
        ? t("tasks:changesHover.sinceSource", { branch: status.sinceSource.branch, commits: t("tasks:changesHover.sinceSourceCommits", { count: status.sinceSource.commits }), files: t("tasks:changesHover.sinceSourceFiles", { count: status.sinceSource.files }) })
        : t("tasks:changesHover.sinceSourceNone", { branch: status.sinceSource.branch }),
      delta: status.sinceSource.commits > 0 ? status.sinceSource : null,
    });
  }
  if (status.uncommitted === "uncounted") rows.push({ key: "uncommitted", text: t("tasks:changesHover.uncommittedUncounted") });
  else if (status.uncommitted.files > 0) rows.push({ key: "uncommitted", text: t("tasks:changesHover.uncommitted", { count: status.uncommitted.files }), delta: status.uncommitted });
  if (status.uncommitted !== "uncounted" && status.untrackedCount > 0) {
    rows.push({ key: "untracked", text: t("tasks:changesHover.untrackedExtra", { count: status.untrackedCount }) });
  }
  if (status.upstream) {
    const { name, ahead, behind } = status.upstream;
    let text = t("tasks:changesHover.upToDateUpstream", { upstream: name });
    if (ahead > 0 && behind > 0) text = t("tasks:changesHover.aheadBehind", { ahead, behind, upstream: name });
    else if (ahead > 0) text = t("tasks:changesHover.aheadOnly", { ahead, upstream: name });
    else if (behind > 0) text = t("tasks:changesHover.behindOnly", { behind, upstream: name });
    rows.push({ key: "upstream", text });
  } else {
    rows.push({ key: "upstream", text: t("tasks:changesHover.unpublished") });
  }
  if (status.sourceBehind && status.sourceBehind.kind !== "omitted") {
    if (status.sourceBehind.kind === "behind") rows.push({ key: "source", text: t("tasks:changesHover.behindSource", { branch: status.sourceBehind.branch, count: status.sourceBehind.count }) });
    else if (status.sourceBehind.kind === "even") rows.push({ key: "source", text: t("tasks:changesHover.evenSource", { branch: status.sourceBehind.branch }) });
    else rows.push({ key: "source", text: t("tasks:changesHover.sourceCompareFailed", { branch: status.sourceBehind.branch }) });
  }
  if (status.isMainWorktree) rows.push({ key: "main", text: t("tasks:changesHover.mainWorktree") });
  if (loading && rows.length === 0) return [{ key: "loading", text: t("tasks:changesHover.loading") }];
  return rows;
}

export function ChangeHoverDetails({ taskId, resource, children }: ChangeHoverDetailsProps) {
  const { t } = useTranslation(["tasks"]);
  const [open, setOpen] = useState(false);
  const { status, loading } = useChangeGitStatus(taskId, resource, open);
  const branchName = status?.branchName || resource.targetBranch || resource.sourceBranch;
  const repoName = status?.repoName || resource.name;
  const workingPath = status?.workingPath || resource.workingPath;
  const rows = statusRows(status, loading, t);
  return <Tooltip onOpenChange={setOpen}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="right" sideOffset={8} data-slot="change-hover" className="flex w-72 max-w-72 flex-col items-stretch gap-2 p-3 text-left">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={branchName || undefined}>{branchName}</p>
        <p className="mt-1 truncate text-background/75">{repoName}</p>
        <p className="mt-0.5 truncate text-background/60" title={workingPath}>{shortenPath(workingPath)}</p>
      </div>
      {rows.length > 0 && <div className="grid min-w-0 gap-1 border-t border-background/15 pt-2">
        {rows.map((row) => <div key={row.key} className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 flex-1 text-background/85">{row.text}</p>
          {row.delta ? <LineDelta stats={row.delta} /> : null}
        </div>)}
      </div>}
    </TooltipContent>
  </Tooltip>;
}
