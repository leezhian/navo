import type { ReviewSession } from "../../domain/types";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import classNames from "classnames";

interface SessionSidebarProps {
  isVisible: boolean;
  orderedSessions: ReviewSession[];
  selectedSessionId: string | null;
  onOpenSettings: () => void;
  onSelectSession: (session: ReviewSession) => void;
}

export function SessionSidebar({
  isVisible,
  orderedSessions,
  selectedSessionId,
  onOpenSettings,
  onSelectSession,
}: SessionSidebarProps) {
  return (
    <AnimatePresence initial={false}>
      {isVisible && (
        <motion.aside
          animate={{ opacity: 1, width: 280, x: 0 }}
          className="grid min-w-0 shrink-0 grid-rows-[1fr_auto] overflow-hidden border-r bg-sidebar"
          exit={{ opacity: 0, width: 0, x: -24 }}
          initial={{ opacity: 0, width: 0, x: -24 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <div className="min-h-0 overflow-y-auto px-3 pt-12 pb-3">
            <h2 className="px-1.5 pb-3 text-sm font-medium text-foreground">会话</h2>
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
            <Button
              className="h-9 w-full justify-start gap-2 px-2.5 font-normal"
              type="button"
              variant="ghost"
              onClick={onOpenSettings}
            >
              <Settings className="size-5" />
              <span>设置</span>
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
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
      className={classNames(
        "mb-2.5 grid w-full gap-1.5 rounded-lg border p-3 text-left text-sm text-muted-foreground",
        active ? "border-primary/40 bg-accent" : "bg-background/70 hover:bg-accent",
      )}
      type="button"
      onClick={onSelect}
    >
      <span className="flex items-center justify-between">
        <span className="inline-flex h-5 w-fit items-center rounded-full bg-muted px-2 text-xs font-medium text-foreground">
          {session.agent}
        </span>
        {session.unread && <span className="size-2 rounded-full bg-destructive" />}
      </span>
      <strong className="text-sm text-foreground">{session.projectName}</strong>
      <span>{session.branchName}</span>
      <span>
        {session.fileCount} files · +{session.additions} -{session.deletions}
      </span>
    </button>
  );
}
