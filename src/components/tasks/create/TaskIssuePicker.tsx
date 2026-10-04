import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TaskIssueFilters } from "./TaskIssueFilters";
import { TaskIssuePanels } from "./TaskIssuePanels";
import { useTasks } from "@/hooks/useTasks";
import { filterTaskIssues, issueRepository, linkedIssueKeys } from "@/utils/taskIssuePicker";
import type { TaskIssueFilters as FilterValues } from "@/utils/taskIssuePicker";
import { useIssueStore } from "@/stores/issueStore";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import { issueStatuses } from "@/components/issues/issueConstants";
import { formatDate } from "@/i18n";

interface TaskIssuePickerProps {
  /** 此次选择的条目类别，与 Issue 页共用完整数据集。 */
  group: IssueGroup;
  /** 当前草稿已关联条目，确认前不直接修改它。 */
  selected: IssueItem[];
  /** 确认后替换该类别的选择，另一类别不受影响。 */
  onConfirm: (items: IssueItem[]) => void;
  /** 取消时丢弃本次临时选择。 */
  onClose: () => void;
  /** 子弹窗退出后将键盘焦点交还创建弹窗中的入口。 */
  onReturnFocus: () => void;
}

export function TaskIssuePicker({ group, selected, onConfirm, onClose, onReturnFocus }: TaskIssuePickerProps) {
  const { t } = useTranslation(["common", "taskCreate", "issues"]);
  const items = useIssueStore((state) => state.items).filter((item) => item.group === group);
  const { tasks, loaded, loading, error, bootstrap } = useTasks();
  const [filters, setFilters] = useState<FilterValues>({ keyword: "", provider: "", repository: "", taskLink: "unlinked", prState: "any" });
  const [selectedIds, setSelectedIds] = useState(new Set(selected.filter((item) => item.group === group).map((item) => item.id)));
  const [preview, setPreview] = useState<IssueItem | null>(null);
  const linked = linkedIssueKeys(tasks);
  const visible = loaded ? filterTaskIssues(items, filters, linked) : [];
  const providers = [...new Set(items.flatMap((item) => item.provider ? [item.provider] : []))].sort();
  const repositories = [...new Set(items.map(issueRepository))].sort();
  const visiblePreview = visible.find((item) => item.id === preview?.id);
  function toggle(id: string) {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-[920px]" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
      <DialogHeader><DialogTitle>{t(group === "PR" ? "taskCreate:links.addPullRequest" : "taskCreate:links.addIssue")}</DialogTitle></DialogHeader>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto p-0.5" data-issue-picker-toolbar="">
        <Input autoFocus className="w-52 min-w-36 shrink text-xs md:text-xs" value={filters.keyword}
          onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} aria-label={t("taskCreate:links.search")} placeholder={t("taskCreate:links.searchPlaceholder")} />
        <TaskIssueFilters group={group} providers={providers} repositories={repositories} value={filters} onChange={setFilters} />
      </div>
      {!loaded && error !== null && <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
        <span>{t("taskCreate:links.loadError")}</span><Button variant="ghost" size="sm" disabled={loading} onClick={() => void bootstrap()}>{t("common:actions.retry")}</Button>
      </div>}
      <TaskIssuePanels busy={!loaded && loading} preview={
        visiblePreview ? <><h3 className="break-words text-sm font-medium">{visiblePreview.title}</h3><dl className="mt-4 space-y-3 text-xs">
          <div><dt className="text-muted-foreground">{t("common:fields.project")}</dt><dd className="mt-1 break-words">{visiblePreview.projectName}</dd></div>
          <div><dt className="text-muted-foreground">{t("common:fields.status")}</dt><dd className="mt-1">{t(issueStatuses[visiblePreview.status])}</dd></div>
          <div><dt className="text-muted-foreground">{t("common:fields.time")}</dt><dd className="mt-1">{formatDate(visiblePreview.date)}</dd></div>
        </dl></> : <p className="text-xs text-muted-foreground">{t("taskCreate:links.emptyPreview")}</p>
      }>
          {visible.map((item) => <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/70" data-selected={selectedIds.has(item.id)}>
            <Checkbox aria-label={t("common:selection.selectItem", { title: item.title })} checked={selectedIds.has(item.id)} onCheckedChange={() => toggle(item.id)} />
            <button type="button" className="min-w-0 flex-1 cursor-default truncate text-left text-xs" title={item.title}
              aria-label={t("common:selection.previewItem", { title: item.title })} onClick={() => setPreview(item)}>
              {item.title}
            </button>
            <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground" title={item.provider ?? t("taskCreate:links.unknownProvider")}>{item.provider ?? t("taskCreate:links.unknownProvider")}</span>
          </div>)}
          {loaded && visible.length === 0 && <p className="p-4 text-xs text-muted-foreground">{t("issues:empty.matches")}</p>}
      </TaskIssuePanels>
      <DialogFooter><span className="mr-auto self-center text-xs text-muted-foreground">{t("common:selection.count", { count: selectedIds.size })}</span>
        <Button variant="ghost" onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button disabled={!loaded} onClick={() => onConfirm(items.filter((item) => selectedIds.has(item.id)))}>{t("common:actions.confirm")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
