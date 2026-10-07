import { useState } from "react";
import { useTranslation } from "react-i18next";
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

interface TaskIssuePickerContentProps {
  /** 与创建任务共用列表、筛选和可调宽度预览。 */
  group: IssueGroup;
  selected: IssueItem[];
  onChange: (items: IssueItem[]) => void;
  /** 已绑定当前任务的条目不可再次添加。 */
  lockedIds?: string[];
  disabled?: boolean;
}

export function TaskIssuePickerContent({ group, selected, onChange, lockedIds = [], disabled = false }: TaskIssuePickerContentProps) {
  const { t } = useTranslation(["common", "taskCreate", "issues"]);
  const items = useIssueStore((state) => state.items).filter((item) => item.group === group);
  const { tasks, loaded, loading, error, bootstrap } = useTasks();
  const [filters, setFilters] = useState<FilterValues>({ keyword: "", provider: "", repository: "", taskLink: "unlinked", prState: "any" });
  const selectedIds = new Set(selected.filter((item) => item.group === group).map((item) => item.id));
  const [preview, setPreview] = useState<IssueItem | null>(null);
  const linked = linkedIssueKeys(tasks);
  const visible = loaded ? filterTaskIssues(items, filters, linked) : [];
  const providers = [...new Set(items.flatMap((item) => item.provider ? [item.provider] : []))].sort();
  const repositories = [...new Set(items.map(issueRepository))].sort();
  const visiblePreview = visible.find((item) => item.id === preview?.id);
  function toggle(id: string) {
    if (disabled || lockedIds.includes(id)) return;
    const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id);
    onChange(items.filter((item) => next.has(item.id)));
  }
  return <>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto p-0.5" data-issue-picker-toolbar="">
        <Input disabled={disabled} autoFocus className="w-52 min-w-36 shrink text-xs md:text-xs" value={filters.keyword}
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
            <Checkbox aria-label={t("common:selection.selectItem", { title: item.title })} disabled={disabled || lockedIds.includes(item.id)} checked={selectedIds.has(item.id) || lockedIds.includes(item.id)} onCheckedChange={() => toggle(item.id)} />
            <button type="button" className="min-w-0 flex-1 cursor-default truncate text-left text-xs" title={item.title}
              aria-label={t("common:selection.previewItem", { title: item.title })} onClick={() => setPreview(item)}>
              {item.title}
            </button>
            <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground" title={item.provider ?? t("taskCreate:links.unknownProvider")}>{item.provider ?? t("taskCreate:links.unknownProvider")}</span>
          </div>)}
          {loaded && visible.length === 0 && <p className="p-4 text-xs text-muted-foreground">{t("issues:empty.matches")}</p>}
      </TaskIssuePanels>
  </>;
}
