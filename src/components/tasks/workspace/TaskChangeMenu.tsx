import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { FolderOpen, LoaderCircle, Play, Settings2, Square, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { agentNames } from "@/domain/agents";
import type { AgentId } from "@/shared/agentTypes";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { ContextMenuItem, ContextMenuPortal, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu";
import { RepositoryProviderIcon } from "@/components/icons/RepositoryProviderIcon";
import { ResourceDialog } from "@/components/settings/ResourceDialog";
import { useWorkspaceOpenActions } from "@/hooks/useWorkspaceOpenActions";
import { useWorkspaceCommands } from "@/hooks/useWorkspaceCommands";
import { useSettingsStore } from "@/stores/settingsStore";
import { useResourceStore } from "@/stores/resourceStore";
import { TaskResourceMenu } from "./TaskResourceMenu";
import { WorkspaceTargetIcon } from "./WorkspaceTargetIcon";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { TaskWorktreeDeleteDialog } from "./TaskWorktreeDeleteDialog";

interface TaskChangeMenuProps {
  /** 操作仅针对当前任务已绑定的工作区。 */
  task: Task;
  resource: TaskResource;
  sessions: TaskSession[];
  /** 原有 CHANGES 条目及快捷按钮，保留左键行为。 */
  children: ReactElement;
  /** 与新建会话入口共用真实能力缓存。 */
  agentChoices: Array<{ id: AgentId; ready: boolean }>;
  /** 会话操作排队时禁止启动或执行命令。 */
  pending: boolean;
  onOpen: () => void;
  onRunCommand: (resourceId: string, commandId: string) => void;
  /** 省略回调时只读展示，不启动本机进程。 */
  onNewSession?: (agentId: AgentId, resourceId: string) => void;
  onNewTerminal?: (resourceId: string) => void;
  onOpenError?: () => void;
}

export function TaskChangeMenu({ task, resource, sessions, children, agentChoices, pending, onOpen, onRunCommand, onNewSession, onNewTerminal, onOpenError }: TaskChangeMenuProps) {
  const { t } = useTranslation(["tasks", "common", "taskCreate"]);
  const opening = useWorkspaceOpenActions(task.id, resource, onOpenError);
  const commands = useWorkspaceCommands(resource, sessions, onRunCommand);
  const repositoriesDirectory = useSettingsStore((state) => state.settings.repositoriesDirectory);
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const disabled = pending || task.status === "ARCHIVED";
  const branch = resource.targetBranch || resource.sourceBranch;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }
  const actions = <>
    <ContextMenuItem onSelect={onOpen}>{t("common:actions.open")}</ContextMenuItem>
    <ContextMenuSub><ContextMenuSubTrigger className="data-disabled:pointer-events-none data-disabled:opacity-50" disabled={opening.disabled}>{t("tasks:changesMenu.openIn")}</ContextMenuSubTrigger><ContextMenuPortal><ContextMenuSubContent className="w-48 [&_svg]:size-3.5!">
      {opening.options?.editors.map((editor) => <ContextMenuItem key={editor.id} onSelect={() => void opening.open({ kind: "editor", editorId: editor.id })}>
        <WorkspaceTargetIcon target={{ kind: "editor", editorId: editor.id }} options={opening.options} /><span className="truncate">{editor.name}</span>
      </ContextMenuItem>)}
      {!!opening.options?.editors.length && <ContextMenuSeparator />}
      <ContextMenuItem onSelect={() => void opening.open({ kind: "fileManager" })}><FolderOpen />{t("tasks:workspaceOpen.fileManager")}</ContextMenuItem>
      <ContextMenuItem disabled={!opening.options?.externalTerminal} onSelect={() => void opening.open({ kind: "terminal" })}><Terminal />{t("tasks:workspaceOpen.terminal")}</ContextMenuItem>
      {opening.options?.remote && <ContextMenuItem onSelect={() => void opening.open({ kind: "remote" })}><RepositoryProviderIcon provider={opening.options.remote.provider} />{t("tasks:workspaceOpen.provider", { provider: opening.options.remote.provider })}</ContextMenuItem>}
    </ContextMenuSubContent></ContextMenuPortal></ContextMenuSub>
    <ContextMenuSeparator />
    <ContextMenuSub><ContextMenuSubTrigger className="data-disabled:pointer-events-none data-disabled:opacity-50" disabled={disabled || !onNewSession}>{t("tasks:changesMenu.newSession")}</ContextMenuSubTrigger><ContextMenuPortal><ContextMenuSubContent className="w-48 [&_svg]:size-3.5!">
      {agentChoices.length ? agentChoices.map((agent) => <ContextMenuItem key={agent.id} disabled={!agent.ready || disabled} onSelect={() => onNewSession?.(agent.id, resource.resourceId)}><AgentProviderIcon agentId={agent.id} /><span>{agentNames[agent.id]}</span></ContextMenuItem>) : <ContextMenuItem disabled>{t("taskCreate:agent.empty")}</ContextMenuItem>}
    </ContextMenuSubContent></ContextMenuPortal></ContextMenuSub>
    <ContextMenuItem disabled={disabled || !onNewTerminal} onSelect={() => onNewTerminal?.(resource.resourceId)}>{t("tasks:changesMenu.newTerminal")}</ContextMenuItem>
    <ContextMenuSub><ContextMenuSubTrigger className="data-disabled:pointer-events-none data-disabled:opacity-50" disabled={disabled || !onOpenError}>{t("tasks:changesMenu.runCommand")}</ContextMenuSubTrigger><ContextMenuPortal><ContextMenuSubContent className="w-48 [&_svg]:size-3.5!">
      {!commands.menuCommands.length && <ContextMenuItem disabled>{t("tasks:commands.empty")}</ContextMenuItem>}
      {commands.menuCommands.map((command) => {
        const active = commands.running.find((session) => session.command?.id === command.id);
        return <ContextMenuItem key={command.id} disabled={disabled} title={t(active ? "tasks:commands.stop" : "tasks:commands.run", { name: command.name })} onSelect={() => commands.select(command.id)}>
          {active?.status === "starting" ? <LoaderCircle className="animate-spin" /> : active ? <Square /> : <Play />}<span className="truncate">{command.name}</span>
        </ContextMenuItem>;
      })}
      {commands.error !== null && <ContextMenuItem onSelect={() => void useResourceStore.getState().refresh()}>{t("common:actions.retry")}</ContextMenuItem>}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!commands.repository || disabled} onSelect={() => setManaging(true)}><Settings2 />{t("tasks:commands.manage")}</ContextMenuItem>
    </ContextMenuSubContent></ContextMenuPortal></ContextMenuSub>
    <ContextMenuSeparator />
    <ContextMenuItem disabled={!branch} onSelect={() => void copy(branch)}>{t("tasks:changesMenu.copyBranch")}</ContextMenuItem>
    <ContextMenuItem onSelect={() => void copy(resource.workingPath)}>{t("tasks:changesMenu.copyPath")}</ContextMenuItem>
    <ContextMenuItem disabled={!opening.options?.remoteUrl} onSelect={() => void copy(opening.options?.remoteUrl ?? "")}>{t("tasks:changesMenu.copyRemote")}</ContextMenuItem>
  </>;
  return <div ref={row}>
    <TaskResourceMenu task={task} resource={{ kind: "workspace", id: resource.resourceId }} actions={actions}
      trailingActions={resource.mode === "worktree" && <ContextMenuItem variant="destructive" disabled={disabled || !resource.ownership || !onOpenError} onSelect={() => setDeleting(true)}>{t("tasks:changesMenu.deleteWorktree")}</ContextMenuItem>}>
      {children}
    </TaskResourceMenu>
    {copyFailed && <p role="alert" className="px-2 text-xs text-destructive">{t("tasks:changesMenu.copyFailed")}</p>}
    {managing && commands.repository && <ResourceDialog record={commands.repository} repositoriesDirectory={repositoriesDirectory} onClose={() => setManaging(false)} onReturnFocus={() => row.current?.querySelector("button")?.focus()} />}
    {deleting && <TaskWorktreeDeleteDialog task={task} resource={resource} onClose={() => setDeleting(false)} />}
  </div>;
}
