import type { ReviewSession } from "../../domain/types";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { PanelLeft, Settings } from "lucide-react";

interface SessionSidebarProps {
  isVisible: boolean;
  orderedSessions: ReviewSession[];
  selectedSessionId: string | null;
  onOpenSettings: () => void;
  onSelectSession: (session: ReviewSession) => void;
  onToggleSidebar: () => void;
}

export function SessionSidebar({
  isVisible,
  orderedSessions,
  selectedSessionId,
  onOpenSettings,
  onSelectSession,
  onToggleSidebar,
}: SessionSidebarProps) {
  if (!isVisible) {
    return (
      <aside className="flex min-w-0 border-r bg-sidebar px-2 py-3">
        <IconTooltip label="显示会话列表" onClick={onToggleSidebar}>
          <PanelLeft className="size-5" />
        </IconTooltip>
      </aside>
    );
  }

  return (
    <aside className="grid min-w-0 grid-rows-[56px_1fr_auto] border-r bg-sidebar">
      <div className="flex items-center pl-2">
        <IconTooltip label="隐藏会话列表" onClick={onToggleSidebar}>
          <PanelLeft className="size-5" />
        </IconTooltip>
      </div>
      <div className="min-h-0 overflow-y-auto p-3">
        <h2 className="px-1.5 pb-3 text-[15px] font-medium text-foreground">会话</h2>
        {orderedSessions.length === 0 ? (
          <div className="px-1.5 py-5 text-muted-foreground">
            <h2 className="mb-2 text-lg font-semibold text-foreground">暂无审查会话</h2>
            <p className="mb-4 text-sm leading-6">开启 Agent 监听后，完成一次代码修改会话即可在这里看到 diff。</p>
            <Button type="button" variant="outline" onClick={onOpenSettings}>
              打开设置
            </Button>
          </div>
        ) : (
          orderedSessions.map((session) => (
            <SessionItem
              active={session.id === selectedSessionId}
              key={session.id}
              session={session}
              onSelect={() => onSelectSession(session)}
            />
          ))
        )}
      </div>
      <div className="p-3">
        <Button className="h-9 w-full justify-start gap-2 px-2.5 font-normal" type="button" variant="ghost" onClick={onOpenSettings}>
          <Settings className="size-5" />
          <span>设置</span>
        </Button>
      </div>
    </aside>
  );
}

function SessionItem({
  active,
  session,
  onSelect,
}: {
  active: boolean;
  session: ReviewSession;
  onSelect: () => void;
}) {
  return (
    <button
      className={
        active
          ? "mb-2.5 grid w-full gap-1.5 rounded-lg border border-primary/40 bg-accent p-3 text-left text-sm text-muted-foreground"
          : "mb-2.5 grid w-full gap-1.5 rounded-lg border bg-background/70 p-3 text-left text-sm text-muted-foreground hover:bg-accent"
      }
      type="button"
      onClick={onSelect}
    >
      <span className="flex items-center justify-between">
        <span className="inline-flex h-5 w-fit items-center rounded-full bg-muted px-2 text-xs font-medium text-foreground">
          {session.agent}
        </span>
        {session.unread && <span className="size-2 rounded-full bg-destructive" />}
      </span>
      <strong className="text-[15px] text-foreground">{session.projectName}</strong>
      <span>{session.branchName}</span>
      <span>
        {session.fileCount} files · +{session.additions} -{session.deletions}
      </span>
    </button>
  );
}
