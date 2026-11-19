import { BookMarked, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { TaskResourceDraft } from "@/domain/taskResourceDraft";
import { TaskTime } from "../TaskTime";
import { TaskResourceBranchOptions } from "../create/TaskResourceBranchOptions";

export interface CatalogItem { id?: string; name: string; localPath: string; kind: "repo" | "folder"; available: boolean; lastTaskUse?: string | null }

interface TaskRepositoryCatalogRowProps {
  /** 本地资源或尚未登记的发现项；notice 仅标记当前任务的绑定。 */
  record: CatalogItem;
  notice?: string;
  /** 展开后才探测仓库；完成前不允许提交。 */
  expanded: boolean;
  draft?: TaskResourceDraft | null;
  disabled: boolean;
  canSubmit: boolean;
  /** 切换展开状态不提交；显式确认只保存本行。 */
  onToggle: () => void;
  onChange: (draft: TaskResourceDraft) => void;
  onSubmit: () => void;
}

export function TaskRepositoryCatalogRow({ record, notice, expanded, draft, disabled, canSubmit, onToggle, onChange, onSubmit }: TaskRepositoryCatalogRowProps) {
  const { t } = useTranslation(["tasks", "common", "taskCreate"]);
  const Icon = record.kind === "repo" ? BookMarked : Folder;
  const submitLabel = draft?.useExistingBranch || draft?.mode === "current-branch" ? t("taskCreate:branches.useExisting")
    : draft?.mode === "worktree" ? t("tasks:resources.createWorktree") : draft?.mode === "new-branch" ? t("tasks:resources.createBranch") : t("tasks:resources.addToTask");
  return <div data-resource-id={record.id} data-selected={expanded} className="rounded-lg hover:bg-muted/60 focus-within:bg-muted/60 data-[selected=true]:bg-accent">
    <button type="button" data-pick-repository aria-expanded={expanded} disabled={disabled} onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{record.name}</span><span className="block truncate text-xs text-muted-foreground" title={record.localPath}>{notice && `${notice} · `}{record.localPath}</span></span>
      {record.lastTaskUse && <span className="shrink-0 text-xs text-muted-foreground"><TaskTime value={record.lastTaskUse} /></span>}
    </button>
    {expanded && <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pl-8">
      {draft?.info.git && <div className="flex flex-wrap items-center gap-1"><TaskResourceBranchOptions value={draft} disabled={disabled} onChange={onChange} showTargetBranch={false} /></div>}
      <div className="ml-auto flex gap-2"><Button size="sm" variant="secondary" disabled={disabled} onClick={onToggle}>{t("common:actions.cancel")}</Button>
        <Button size="sm" disabled={disabled || !canSubmit} onClick={onSubmit}>{submitLabel}</Button></div>
    </div>}
  </div>;
}
