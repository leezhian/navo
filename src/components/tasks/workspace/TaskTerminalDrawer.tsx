import { useRef, useState, type ReactNode } from "react";
import { PanelBottomClose, Maximize2, Minimize2, RotateCw, Terminal, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { TerminalWorkspace } from "@/components/terminal/TerminalWorkspace";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { hasManagedTerminalSession } from "@/components/terminal/terminalSessionManager";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

interface TaskTerminalDrawerProps {
  /** 任务内的普通终端，与上下文分组共享同一数据源。 */
  sessions: TaskSession[];
  activeId?: string;
  expanded: boolean;
  onSelect: (id: string) => void;
  /** 与上下文分组共用的工作目录选择及新建入口。 */
  newTerminalControl: ReactNode;
  onExpand: () => void;
  /** 收起不终止进程；每个标签的关闭操作则终止进程树。 */
  onCollapse: () => void;
  /** 归档任务中的已退出终端可查看输出，不允许再执行。 */
  readOnly?: boolean;
}
export function TaskTerminalDrawer({ sessions, activeId, expanded, onSelect, newTerminalControl, onExpand, onCollapse, readOnly }: TaskTerminalDrawerProps) {
  const { t } = useTranslation(["common", "tasks"]);
  const active = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const pending = useTaskSessionStore((state) => state.pending);
  const [confirmation, setConfirmation] = useState<{ terminalId: string; program?: string } | null>(null);
  const closeButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterDialog = useRef<string>(undefined);
  const cancel = useRef<HTMLButtonElement>(null);
  const target = sessions.find((session) => confirmation?.terminalId === session.terminalId);
  const exitCode = active?.terminalExitCode ?? active?.commandExitCode;
  async function close(session: TaskSession, mode: "inspect" | "confirm" | "force") {
    const result = await useTaskSessionStore.getState().closeTerminal(session.id, session.terminalId, mode);
    if (result?.kind === "confirm") {
      focusAfterDialog.current = session.id;
      setConfirmation({ terminalId: session.terminalId, program: result.program });
    } else if (result) setConfirmation(null);
  }

  return <section className="task-workbench-panel task-shell-pane">
    <header className="task-workbench-panel-heading">
      <div className="task-shell-tabs">{sessions.map((session) => {
        const needsForce = session.terminalNeedsForce;
        return <ContextMenu key={session.id}>
          <ContextMenuTrigger asChild><div className="task-shell-tab" data-active={session.id === active?.id}>
            <button onClick={() => onSelect(session.id)}><Terminal className="size-3" /><span>{session.title}</span></button>
            <button aria-label={needsForce ? t("tasks:runtime.forceCloseTerminal") : t("tasks:runtime.closeTerminal", { name: session.title })}
              title={needsForce ? t("tasks:runtime.closeTerminalTimedOut") : undefined} disabled={pending}
              ref={(button) => {
                if (button) closeButtons.current.set(session.id, button);
                else closeButtons.current.delete(session.id);
              }}
              onClick={() => void close(session, needsForce ? "force" : "inspect")}>
              {needsForce ? <TriangleAlert className="size-3 text-destructive" /> : <X className="size-3" />}
            </button>
          </div></ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem disabled={pending} onSelect={() => void close(session, "inspect")}>{t("tasks:runtime.closeTerminal", { name: session.title })}</ContextMenuItem>
            {needsForce && <ContextMenuItem variant="destructive" disabled={pending} onSelect={() => void close(session, "force")}>{t("tasks:runtime.forceCloseTerminal")}</ContextMenuItem>}
          </ContextMenuContent>
        </ContextMenu>;
      })}</div>
      <div className="flex shrink-0 items-center gap-1">
        {newTerminalControl}
        <IconTooltip label={t(expanded ? "tasks:runtime.restoreTerminal" : "tasks:runtime.expandTerminal")} size="icon-xs" onClick={onExpand}>{expanded ? <Minimize2 /> : <Maximize2 />}</IconTooltip>
        <IconTooltip label={t("tasks:runtime.hideTerminal")} size="icon-xs" onClick={onCollapse}><PanelBottomClose /></IconTooltip>
      </div>
    </header>
    {active && (active.status === "running" || exitCode !== undefined || hasManagedTerminalSession(active.terminalId)) ? <TerminalWorkspace key={active.terminalId} title={active.title} sessionId={active.terminalId} cwd={active.cwd} compact attachOnly autoFocus={!active.command} /> :
      <div className="task-session-empty"><p>{t(active?.status === "failed" ? "tasks:runtime.startFailed" : "tasks:runtime.status.stopped")}</p></div>}
    {active?.terminalNeedsForce && <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-1 text-xs">
      <p role="alert">{t("tasks:runtime.closeTerminalTimedOut")}</p>
      <Button variant="destructive" size="sm" disabled={pending} onClick={() => void close(active, "force")}>{t("tasks:runtime.forceCloseTerminal")}</Button>
    </footer>}
    {active && exitCode !== undefined && <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-1 text-xs text-muted-foreground">
      <span>{t("tasks:runtime.terminalExited", { code: exitCode })}</span>
      {active.command && !active.initialization && !active.terminalNeedsForce && <Button variant="outline" size="sm" disabled={pending || readOnly}
        onClick={() => void useTaskSessionStore.getState().rerunCommand(active.id, active.terminalId)}><RotateCw />{t("tasks:runtime.runAgain")}</Button>}
    </footer>}
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !pending) setConfirmation(null); }}>
      <DialogContent role="alertdialog" showCloseButton={false} onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}
        onCloseAutoFocus={(event) => {
          const button = closeButtons.current.get(focusAfterDialog.current ?? "") ?? closeButtons.current.get(active?.id ?? "");
          if (button?.isConnected && !button.disabled) {
            event.preventDefault();
            button.focus();
          }
        }}>
        <DialogTitle>{t("tasks:runtime.closeTerminalTitle")}</DialogTitle>
        <DialogDescription>{confirmation?.program
          ? t("tasks:runtime.closeTerminalProgram", { program: confirmation.program })
          : t("tasks:runtime.closeTerminalUnknown")}</DialogDescription>
        <DialogFooter>
          <Button ref={cancel} disabled={pending} variant="outline" onClick={() => setConfirmation(null)}>{t("common:actions.cancel")}</Button>
          <Button disabled={pending} variant="destructive" onClick={() => { if (target) void close(target, "confirm"); }}>{t("tasks:runtime.confirmCloseTerminal")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
