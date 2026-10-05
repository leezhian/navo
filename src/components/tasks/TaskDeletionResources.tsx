import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { TaskDeletionItem } from "@/shared/taskDeletionTypes";
import type { TranslationKey } from "@/i18n/types";

interface TaskDeletionResourcesProps {
  /** 已由主进程检查的删除或保留清单，不根据前端路径自行推断安全性。 */
  items: TaskDeletionItem[];
}

const reasons = {
  existing: "tasks:deletion.reasons.existing",
  unowned: "tasks:deletion.reasons.unowned",
  shared: "tasks:deletion.reasons.shared",
  changed: "tasks:deletion.reasons.changed",
  main: "tasks:deletion.reasons.main",
  locked: "tasks:deletion.reasons.locked",
  missing: "tasks:deletion.reasons.missing",
  protected: "tasks:deletion.reasons.protected",
  inUse: "tasks:deletion.reasons.inUse",
  inspectionFailed: "tasks:deletion.reasons.inspectionFailed",
} satisfies Record<NonNullable<TaskDeletionItem["worktreeReason"]>, TranslationKey<"tasks">>;

export function TaskDeletionResources({ items }: TaskDeletionResourcesProps) {
  const { t } = useTranslation(["tasks"]);
  const groups = [
    { title: "tasks:deletion.willDelete" as const, rows: items.filter((item) => item.worktreeAction === "delete" || item.branchAction === "delete") },
    { title: "tasks:deletion.kept" as const, rows: items.filter((item) => item.worktreeAction === "keep" && item.branchAction !== "delete") },
    { title: "tasks:deletion.completed" as const, rows: items.filter((item) => item.worktreeAction === "removed" && item.branchAction !== "delete") },
  ];
  return <div className="space-y-4">
    {groups.filter((group) => group.rows.length).map((group) => <section key={group.title}>
      <h3 className="mb-2 text-xs text-muted-foreground">{t(group.title)}</h3>
      <div className="space-y-2">{group.rows.map((item) => {
        const risk = item.worktreeAction === "delete" && (item.uncommittedFiles > 0 || item.ignoredFiles > 0 || item.detached)
          || item.branchAction === "delete" && item.unpushedCommits !== 0;
        return <div key={item.resourceId} className="rounded-lg bg-muted/40 p-3 text-xs leading-5">
          <p className="flex items-center gap-2 font-medium">
            {risk && <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />}
            <span className="min-w-0 truncate" title={item.path}>{item.name}{item.branch && <span className="ml-2 font-mono font-normal text-muted-foreground">{item.branch}</span>}</span>
          </p>
          {item.worktreeReason && <p className="text-muted-foreground">{t(reasons[item.worktreeReason])}{item.sharedTasks.length > 0 && " · " + item.sharedTasks.join(", ")}</p>}
          {item.worktreeAction === "removed" && <p className="text-muted-foreground">{t("tasks:deletion.worktreeRemoved")}</p>}
          {item.worktreeAction === "delete" && <>
            {item.uncommittedFiles > 0 && <p className="text-destructive">{t("tasks:deletion.uncommitted", { count: item.uncommittedFiles })}</p>}
            {item.ignoredFiles > 0 && <p className="text-destructive">{t("tasks:deletion.ignored", { count: item.ignoredFiles })}</p>}
            {item.detached && <p className="text-destructive">{t("tasks:deletion.detached")}</p>}
            {!item.uncommittedFiles && !item.ignoredFiles && !item.detached && <p className="text-muted-foreground">{t("tasks:deletion.clean")}</p>}
          </>}
          {item.branchAction === "delete" && <p className={item.unpushedCommits === 0 ? "text-muted-foreground" : "text-destructive"}>
            {item.unpushedCommits === null ? t("tasks:deletion.unpublished") : item.unpushedCommits === 0 ? t("tasks:deletion.pushed") : t("tasks:deletion.unpushed", { count: item.unpushedCommits })}
          </p>}
          {item.branchReason && <p className="text-muted-foreground">{t("tasks:deletion.branchKept")} · {t(reasons[item.branchReason])}</p>}
          {item.branchAction === "removed" && <p className="text-muted-foreground">{t("tasks:deletion.branchRemoved")}</p>}
        </div>;
      })}</div>
    </section>)}
  </div>;
}
