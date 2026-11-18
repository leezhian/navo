import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceDialog } from "@/components/settings/ResourceDialog";
import { TaskRepositoryCatalogRow, type CatalogItem } from "./TaskRepositoryCatalogRow";
import { useResourceStore } from "@/stores/resourceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { resourceApi } from "@/services/resourceApi";
import { settingsApi } from "@/services/settingsApi";
import { getSettingsError } from "@/services/settingsErrors";
import { getTaskError } from "@/services/taskErrors";
import { getFolderName } from "@/utils/resourceNames";
import { taskResourceNotice } from "@/utils/taskResourceNotice";
import type { Task } from "@/domain/tasks";
import type { useTaskResourceSelection } from "@/hooks/useTaskResourceSelection";

interface TaskRepositoryCatalogProps {
  /** 当前任务的目录只用于已关联提示，不禁止同仓库另建工作树。 */
  task: Task;
  /** 草稿由弹窗持有，返回列表后不丢失选项。 */
  selection: ReturnType<typeof useTaskResourceSelection>;
  /** 行内确认复用工作目录草稿的校验和事务提交。 */
  canSubmit: boolean;
  onSubmit: () => void;
  disabled: boolean;
  /** 原生选择器和克隆弹窗打开期间阻止关闭父层或切换标签。 */
  onBusyChange: (busy: boolean) => void;
}

export function TaskRepositoryCatalog({ task, selection, canSubmit, onSubmit, disabled, onBusyChange }: TaskRepositoryCatalogProps) {
  const { t } = useTranslation(["tasks", "taskCreate", "settings", "common"]);
  const resources = useResourceStore();
  const directory = useSettingsStore((state) => state.settings.repositoriesDirectory);
  const [query, setQuery] = useState("");
  const [discovered, setDiscovered] = useState<string[] | null>(null);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const cloneTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { void resources.refresh(); }, [resources.refresh]);

  const currentUsage = new Map<string, string | null>();
  for (const resource of task.resources ?? []) {
    const id = resource.repositoryId ?? resource.resourceId;
    const latest = currentUsage.get(id);
    currentUsage.set(id, resource.addedAt && (!latest || latest < resource.addedAt) ? resource.addedAt : latest ?? null);
  }
  const knownPaths = new Set(resources.records.map((record) => record.localPath));
  const items: CatalogItem[] = resources.records.map((record) => {
    const current = currentUsage.get(record.id);
    if (current === undefined || (record.lastTaskUse && (!current || record.lastTaskUse >= current))) return record;
    return { ...record, lastTaskUse: current };
  });
  for (const path of discovered ?? []) {
    if (!knownPaths.has(path)) items.push({ name: getFolderName(path), localPath: path, kind: "repo", available: true });
  }
  const keyword = query.trim().toLowerCase();
  const visible = items.filter((item) => `${item.name} ${item.localPath}`.toLowerCase().includes(keyword));
  const suggested = visible.filter((item) => item.lastTaskUse !== undefined).sort((left, right) => (right.lastTaskUse ?? "").localeCompare(left.lastTaskUse ?? ""));
  const groups = [{ label: "suggested", rows: suggested }, { label: "other", rows: visible.filter((item) => item.lastTaskUse === undefined) }] as const;
  async function nativeAction(action: () => Promise<void>) {
    onBusyChange(true); setError(null);
    try { await action(); } catch (failure) { setError(failure); } finally { onBusyChange(false); }
  }
  async function register(path: string, kind: "repo" | "folder") {
    const record = resources.records.find((item) => item.localPath === path) ?? await resourceApi.save({ name: getFolderName(path), kind, localPath: path });
    resources.upsert(record); setQuery("");
    if (!task.resources?.some((item) => item.mode === "folder" && item.workingPath === record.localPath)) selection.select(record.id, true);
  }
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t("tasks:resources.catalog")}</h3><div className="flex gap-1">
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void nativeAction(async () => { const path = await settingsApi.chooseDirectory(); if (path) await register(path, "folder"); })}><FolderOpen />{t("tasks:resources.openFolder")}</Button>
      <Button ref={cloneTrigger} variant="ghost" size="sm" disabled={disabled} onClick={() => { setCloning(true); onBusyChange(true); }}><Download />{t("tasks:resources.clone")}</Button>
    </div></div>
    <label className="relative block"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus disabled={disabled} className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("taskCreate:resources.search")} placeholder={t("settings:resources.searchPlaceholder")} /></label>
    <button type="button" className="self-center text-xs text-muted-foreground underline" disabled={disabled} onClick={() => void nativeAction(async () => { const paths = await resourceApi.chooseRepositoriesFolder(); if (paths !== null) setDiscovered(paths); })}>{t("tasks:resources.discover")}</button>
    {discovered?.length === 0 && <p role="status" className="text-center text-xs text-muted-foreground">{t("tasks:resources.noDiscoveries")}</p>}
    {(error || resources.error || selection.error) != null && <p role="alert" className="text-xs text-destructive">{selection.error ? getTaskError(selection.error) : getSettingsError(error ?? resources.error)}</p>}
    {groups.map(({ label, rows }) => <section key={label} data-repository-group={label}><h4 className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">{t(`tasks:resources.${label}`)}<span>{rows.length}</span></h4>
      {rows.map((record) => {
        const selected = selection.selections.find((item) => item.resourceId === record.id);
        const blocked = disabled || !record.available || task.resources?.some((item) => item.mode === "folder" && (item.repositoryId ?? item.resourceId) === record.id);
        const notice = record.kind === "repo" && record.id ? taskResourceNotice(record.id, selected?.draft, task.resources ?? []) : undefined;
        const noticeText = notice === "branch" ? t("taskCreate:resources.branchAdded") : notice === "repo" ? t("taskCreate:resources.repoAdded") : undefined;
        return <TaskRepositoryCatalogRow key={record.localPath} record={record} notice={noticeText} expanded={Boolean(selected)} draft={selected?.draft}
          disabled={Boolean(blocked)} canSubmit={canSubmit} onChange={selection.update} onSubmit={onSubmit}
          onToggle={() => record.id ? selection.select(record.id, !selected) : void nativeAction(() => register(record.localPath, "repo"))} />;
      })}</section>)}
    {resources.loaded && groups.every((group) => !group.rows.length) && <p className="text-xs text-muted-foreground">{t("settings:resources.empty")}</p>}
    {cloning && <ResourceDialog repositoriesDirectory={directory} onClose={() => { setCloning(false); onBusyChange(false); }} onReturnFocus={() => cloneTrigger.current?.focus()} onSaved={(record) => { selection.select(record.id, true); setQuery(""); }} />}
  </>;
}
