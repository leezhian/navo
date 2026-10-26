import { useRef, useState } from "react";
import { ChevronDown, FolderOpen, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskResource } from "@/shared/taskTypes";
import type { WorkspaceOpenTarget } from "@/shared/workspaceOpenTypes";
import { ButtonGroup } from "@/components/ui/button-group";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getTasksApi } from "@/services/taskApi";
import { useWorkspaceOpenOptions } from "@/hooks/useWorkspaceOpenOptions";
import { RepositoryProviderIcon } from "@/components/icons/RepositoryProviderIcon";
import { WorkspaceTargetIcon } from "./WorkspaceTargetIcon";
import { useSettingsStore } from "@/stores/settingsStore";
import { availableWorkspaceOpenTarget } from "@/utils/workspaceOpenTarget";

interface WorkspaceOpenActionsProps {
  /** 主进程仅接受已保存任务和资源 ID，实际路径由主进程重新解析。 */
  taskId: string;
  resource: TaskResource;
  /** 缺省时为只读预览，不检测或打开用户的应用。 */
  onError?: () => void;
}
export function WorkspaceOpenActions({ taskId, resource, onError }: WorkspaceOpenActionsProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const { options, refreshAfterFailure } = useWorkspaceOpenOptions(taskId, resource.resourceId, resource.workingPath, Boolean(onError));
  const preferred = useSettingsStore((state) => state.settings.lastWorkspaceOpenTarget);
  const defaultTarget = availableWorkspaceOpenTarget(preferred, options);
  const defaultLabel = defaultTarget.kind === "editor" ? t("tasks:workspaceOpen.editor", { editor: options?.editors.find((editor) => editor.id === defaultTarget.editorId)?.name })
    : defaultTarget.kind === "remote" ? t("tasks:workspaceOpen.provider", { provider: options?.remote?.provider })
    : t(defaultTarget.kind === "terminal" ? "tasks:workspaceOpen.terminal" : "tasks:workspaceOpen.fileManager");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const disabled = !onError || busy;
  async function open(target: WorkspaceOpenTarget) {
    if (!onError || busyRef.current) return;
    busyRef.current = true;setBusy(true);
    try {
      await getTasksApi().openWorkspace(taskId, resource.resourceId, target);
      const store = useSettingsStore.getState();
      const previous = store.settings.lastWorkspaceOpenTarget;
      if (previous.kind !== target.kind || (previous.kind === "editor" && target.kind === "editor" && previous.editorId !== target.editorId)) {
        store.update((settings) => ({ ...settings, lastWorkspaceOpenTarget: target }));
      }
    }
    catch { if (target.kind === "editor") refreshAfterFailure();onError(); }
    finally { busyRef.current = false;setBusy(false); }
  }
  return <ButtonGroup className="shrink-0" aria-label={t("tasks:workspaceOpen.actions", { name: resource.name })}>
    <IconTooltip label={defaultLabel} variant="ghost" size="icon-xs" className="size-5 border-0" disabled={disabled} onClick={() => void open(defaultTarget)}><WorkspaceTargetIcon target={defaultTarget} options={options} /></IconTooltip>
    <DropdownMenu><DropdownMenuTrigger asChild>
      <IconTooltip label={t("tasks:workspaceOpen.actions", { name: resource.name })} variant="ghost" size="icon-xs" className="h-5 w-4 border-0" disabled={disabled}><ChevronDown className="size-3" /></IconTooltip>
    </DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">
      {options?.editors.map((editor) => <DropdownMenuItem key={editor.id} className="text-xs" disabled={busy} onSelect={() => void open({ kind: "editor", editorId: editor.id })}>
        <WorkspaceTargetIcon target={{ kind: "editor", editorId: editor.id }} options={options} /><span className="truncate" title={editor.name}>{editor.name}</span>
      </DropdownMenuItem>)}
      {Boolean(options?.editors.length) && <DropdownMenuSeparator />}
      <DropdownMenuItem className="text-xs" disabled={busy} onSelect={() => void open({ kind: "fileManager" })}><FolderOpen className="size-3.5" />{t("tasks:workspaceOpen.fileManager")}</DropdownMenuItem>
      <DropdownMenuItem className="text-xs" disabled={busy || !options?.externalTerminal} onSelect={() => void open({ kind: "terminal" })}><Terminal className="size-3.5" />{t("tasks:workspaceOpen.terminal")}</DropdownMenuItem>
      {options?.remote && <DropdownMenuItem className="text-xs" disabled={busy} onSelect={() => void open({ kind: "remote" })}><RepositoryProviderIcon provider={options.remote.provider} /><span className="truncate">{t("tasks:workspaceOpen.provider", { provider: options.remote.provider })}</span></DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu>
  </ButtonGroup>;
}
