import type { ReviewSession } from "../../domain/types";
import { Button } from "@/components/ui/button";
import { SESSION_SIDEBAR_TRANSITION, SESSION_SIDEBAR_WIDTH } from "@/shared/windowLayout";
import { Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import classNames from "classnames";

interface SessionSidebarProps {
  /** 控制会话栏是否参与布局；隐藏时会执行宽度收起动画。 */
  isVisible: boolean;
  /** 已按更新时间排序的会话列表，组件内只负责展示。 */
  orderedSessions: ReviewSession[];
  /** 当前打开的会话 id，用于高亮对应列表项。 */
  selectedSessionId: string | null;
  /** 打开偏好设置面板，同时由上层负责关闭当前审查内容。 */
  onOpenSettings: () => void;
  /** 选择会话后进入对应审查页，并清理未读状态。 */
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
          animate={{ opacity: 1, width: SESSION_SIDEBAR_WIDTH, x: 0 }}
          className="shrink-0 overflow-hidden border-r bg-sidebar"
          exit={{ opacity: 0, width: 0, x: -24 }}
          initial={{ opacity: 0, width: 0, x: -24 }}
          transition={SESSION_SIDEBAR_TRANSITION}
        >
          <div className="grid h-full grid-rows-[1fr_auto]" style={{ width: SESSION_SIDEBAR_WIDTH }}>
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
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

interface SessionItemProps {
  /** 当前会话是否为正在查看的审查会话。 */
  active: boolean;
  /** 会话摘要，用于展示项目、分支、Agent 和改动统计。 */
  session: ReviewSession;
  /** 点击会话卡片时触发选择。 */
  onSelect: () => void;
}

function SessionItem({ active, session, onSelect }: SessionItemProps) {
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
