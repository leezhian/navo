import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { Archive, ArchiveRestore, Link, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentId } from "@/shared/agentTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { agentNames } from "@/domain/agents";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { SessionActionDialog, type SessionDialogAction } from "./SessionActionDialog";
import { useSessionReadAction } from "@/hooks/useSessionReadAction";
import { copySessionLink } from "@/utils/copySessionLink";

interface TaskSessionMenuProps {
  /** 菜单始终作用于右击的会话，不依赖当前选中项。 */
  session: TaskSession;
  /** 保留原条目的左键选择和快捷归档按钮。 */
  children: ReactElement;
  /** 使用工作台已有的能力缓存，展开菜单不重新检测。 */
  agentChoices: Array<{ id: AgentId; ready: boolean }>;
  /** 任务归档、来源目录失效或缺少创建回调时禁止派生新会话。 */
  canCreate: boolean;
  pending: boolean;
  /** 活动会话始终展示，再次打开不会收起面板。 */
  onOpen?: () => void;
  onArchive?: () => void;
  /** 归档会话复用条目的恢复行为；任务已归档时不传，禁用恢复。 */
  onRestore?: () => void;
  /** 仅传来源会话 ID；实际目录与任务归属由主进程核对。 */
  onNewSession?: (agentId: AgentId, sourceSessionId: string) => void;
}

export function TaskSessionMenu({ session, children, agentChoices, canCreate, pending, onOpen, onArchive, onRestore, onNewSession }: TaskSessionMenuProps) {
  const { t } = useTranslation(["tasks", "common", "taskCreate"]);
  const [action, setAction] = useState<SessionDialogAction | null>(null);
  const selectedAction = useRef(false);
  const archived = Boolean(session.archivedAt);
  const nativeSupported = Boolean(session.nativeSessionId && ["claude", "grok"].includes(session.agent?.agentId ?? ""));
  const readAction = useSessionReadAction(session);
  const ReadIcon = readAction.icon;
  function openAction(next: SessionDialogAction) {
    useTaskSessionStore.setState({ error: null });
    selectedAction.current = true;
    setAction(next);
  }
  return <>
    <ContextMenu onOpenChange={(open) => { if (open) selectedAction.current = false; }}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48 [&_svg]:size-3.5!" updatePositionStrategy="always" onCloseAutoFocus={(event) => { if (selectedAction.current) event.preventDefault(); }}>
        {archived ? <ContextMenuItem disabled={pending || !onRestore} onSelect={() => { selectedAction.current = true; onRestore?.(); }}><ArchiveRestore />{t("common:actions.restore")}</ContextMenuItem> : <>
          <ContextMenuItem disabled={!onOpen} onSelect={() => { selectedAction.current = true; onOpen?.(); }}>{t("common:actions.open")}</ContextMenuItem>
          <ContextMenuItem disabled={pending || !nativeSupported} onSelect={() => openAction("rename")}><Pencil />{t("tasks:runtime.renameSession")}</ContextMenuItem>
          <ContextMenuItem onSelect={() => { selectedAction.current = true; readAction.run(); }}><ReadIcon />{readAction.label}</ContextMenuItem>
        </>}
        <ContextMenuSub><ContextMenuSubTrigger className="data-disabled:pointer-events-none data-disabled:opacity-50" disabled={pending || !canCreate || !onNewSession}>{t("tasks:runtime.newSessionFrom")}</ContextMenuSubTrigger>
          <ContextMenuPortal><ContextMenuSubContent className="w-48 [&_svg]:size-3.5!">
            {agentChoices.length ? agentChoices.map((choice) => <ContextMenuItem key={choice.id} disabled={pending || !canCreate || !choice.ready} onSelect={() => { selectedAction.current = true; onNewSession?.(choice.id, session.id); }}>
              <AgentProviderIcon agentId={choice.id} /><span>{agentNames[choice.id]}</span>
            </ContextMenuItem>) : <ContextMenuItem disabled>{t("taskCreate:agent.empty")}</ContextMenuItem>}
          </ContextMenuSubContent></ContextMenuPortal>
        </ContextMenuSub>
        <ContextMenuItem onSelect={() => { selectedAction.current = true; void copySessionLink(session.taskId, session.id); }}><Link />{t("tasks:runtime.copySessionLink")}</ContextMenuItem>
        <ContextMenuSeparator />
        {!archived && <ContextMenuItem disabled={pending || !onArchive} onSelect={() => { selectedAction.current = true; onArchive?.(); }}><Archive />{t("tasks:runtime.archiveSession")}</ContextMenuItem>}
        <ContextMenuItem variant="destructive" disabled={pending || !nativeSupported} onSelect={() => openAction("delete")}><Trash2 />{t("tasks:runtime.deleteSession")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    {action && <SessionActionDialog key={session.id + action} session={session} action={action} onClose={() => setAction(null)} />}
  </>;
}
