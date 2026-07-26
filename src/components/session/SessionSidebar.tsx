import { useMemo, useState } from "react";
import { filterSessions, groupSessionsByProject } from "@/domain/sessionGroups";
import type { SessionGroup } from "@/domain/sessionGroups";
import { AGENT_TYPES, type AgentType, type ReviewSession } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { useSessionGroupCollapse } from "@/hooks/useSessionGroupCollapse";
import { SESSION_SIDEBAR_TRANSITION, SESSION_SIDEBAR_WIDTH } from "@/shared/windowLayout";
import { Archive, Folder, FolderOpen, GitBranch, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import classNames from "classnames";
import { SessionFilterBar } from "./SessionFilterBar";

interface SessionSidebarProps {
  /** 控制会话栏是否参与布局；隐藏时会执行宽度收起动画。 */
  isVisible: boolean;
  /** 已按更新时间排序的会话列表，组件内负责分组和过滤展示。 */
  orderedSessions: ReviewSession[];
  /** 当前打开的会话 id，用于高亮对应列表项。 */
  selectedSessionId: string | null;
  /** 归档会话：从列表移除并删除其本地审查记录。 */
  onArchiveSession: (session: ReviewSession) => void;
  /** 打开偏好设置面板，同时由上层负责关闭当前审查内容。 */
  onOpenSettings: () => void;
  /** 选择会话后进入对应审查页，并清理未读状态。 */
  onSelectSession: (session: ReviewSession) => void;
}

export function SessionSidebar({
  isVisible,
  orderedSessions,
  selectedSessionId,
  onArchiveSession,
  onOpenSettings,
  onSelectSession,
}: SessionSidebarProps) {
  const [searchText, setSearchText] = useState("");
  const [enabledAgents, setEnabledAgents] = useState<Set<AgentType>>(() => new Set(AGENT_TYPES));
  const { collapsedProjectPaths, toggleGroup } = useSessionGroupCollapse();
  // 搜索或 Agent 筛选生效时视为过滤态：强制展开所有匹配组，避免结果被折叠遮住。
  const isFiltering = searchText.trim().length > 0 || enabledAgents.size < AGENT_TYPES.length;
  const groups = useMemo(
    () => groupSessionsByProject(filterSessions(orderedSessions, searchText, enabledAgents)),
    [orderedSessions, searchText, enabledAgents],
  );

  function toggleAgent(agent: AgentType) {
    setEnabledAgents((current) => {
      const next = new Set(current);
      if (next.has(agent)) {
        next.delete(agent);
      } else {
        next.add(agent);
      }
      return next;
    });
  }

  return (
    <AnimatePresence initial={false}>
      {isVisible && (
        <motion.aside
          animate={{ opacity: 1, width: SESSION_SIDEBAR_WIDTH, x: 0 }}
          className="relative shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar/58 text-sidebar-foreground backdrop-blur-[120px] backdrop-saturate-175 supports-[backdrop-filter]:bg-sidebar/52 dark:bg-sidebar/78 dark:backdrop-blur-[120px] dark:backdrop-saturate-125 dark:supports-[backdrop-filter]:bg-sidebar/72"
          exit={{ opacity: 0, width: 0, x: -24 }}
          initial={{ opacity: 0, width: 0, x: -24 }}
          transition={SESSION_SIDEBAR_TRANSITION}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/22 via-white/10 to-white/4 dark:from-black/18 dark:via-black/14 dark:to-black/20" />
          <div className="relative grid h-full grid-rows-[1fr_auto]" style={{ width: SESSION_SIDEBAR_WIDTH }}>
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
                <>
                  <SessionFilterBar
                    enabledAgents={enabledAgents}
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    onToggleAgent={toggleAgent}
                  />
                  {groups.length === 0 ? (
                    <p className="px-1.5 py-6 text-center text-sm text-muted-foreground">没有匹配的会话</p>
                  ) : (
                    groups.map((group) => (
                      <SessionGroupSection
                        collapsed={!isFiltering && collapsedProjectPaths.has(group.projectPath)}
                        group={group}
                        key={group.projectPath}
                        selectedSessionId={selectedSessionId}
                        onArchiveSession={onArchiveSession}
                        onSelectSession={onSelectSession}
                        onToggleCollapse={() => toggleGroup(group.projectPath)}
                      />
                    ))
                  )}
                </>
              )}
            </div>
            <div className="p-3">
              <Button
                className="h-9 w-full justify-start gap-2 px-2.5 font-normal"
                type="button"
                variant="ghost"
                onClick={onOpenSettings}
              >
                <Settings className="size-4" />
                <span>设置</span>
              </Button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

interface SessionGroupSectionProps {
  /** 当前分组是否折叠；过滤态下由上层强制展开。 */
  collapsed: boolean;
  /** 项目分组数据，含组内会话和未读数。 */
  group: SessionGroup;
  /** 当前打开的会话 id，用于组内条目高亮和折叠时的组头高亮。 */
  selectedSessionId: string | null;
  /** 归档组内会话。 */
  onArchiveSession: (session: ReviewSession) => void;
  /** 选择组内会话。 */
  onSelectSession: (session: ReviewSession) => void;
  /** 切换分组折叠状态。 */
  onToggleCollapse: () => void;
}

function SessionGroupSection({
  collapsed,
  group,
  selectedSessionId,
  onArchiveSession,
  onSelectSession,
  onToggleCollapse,
}: SessionGroupSectionProps) {
  // 折叠后组内选中项不可见，改由组头承接选中态提示。
  const containsSelected = group.sessions.some((session) => session.id === selectedSessionId);

  return (
    <section className="mb-1">
      <button
        className={classNames(
          "flex h-8 w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-sm",
          collapsed && containsSelected
            ? "bg-secondary text-secondary-foreground"
            : "hover:bg-muted dark:hover:bg-muted/50",
        )}
        type="button"
        onClick={onToggleCollapse}
      >
        {collapsed ? (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{group.projectName}</span>
        {group.unreadCount > 0 && (
          <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-white">
            {group.unreadCount}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="mt-0.5 mb-1.5">
          {group.sessions.map((session) => (
            <SessionItem
              active={session.id === selectedSessionId}
              key={session.id}
              session={session}
              onArchive={() => onArchiveSession(session)}
              onSelect={() => onSelectSession(session)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface SessionItemProps {
  /** 当前会话是否为正在查看的审查会话。 */
  active: boolean;
  /** 会话摘要，展示 Agent 标签、分支名和未读状态。 */
  session: ReviewSession;
  /** 归档当前会话；仅在条目 hover 时按钮可见，点击不触发会话选中。 */
  onArchive: () => void;
  /** 点击会话条目时触发选择。 */
  onSelect: () => void;
}

function SessionItem({ active, session, onArchive, onSelect }: SessionItemProps) {
  return (
    // 条目内含归档按钮，button 不允许嵌套，改用带按钮语义的 div 承载整行选中。
    <div
      className={classNames(
        "group relative flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg py-1 pr-2 pl-7 text-left text-sm text-muted-foreground dark:text-sidebar-foreground/70",
        active
          ? "bg-secondary text-foreground"
          : "hover:bg-muted dark:hover:bg-muted/50",
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(keyboardEvent) => {
        // 恢复原生 button 的键盘可达性：Enter / 空格触发选中。
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-xs font-medium text-foreground">
        {session.agent}
      </span>
      <span className="flex min-w-0 items-center gap-1.5" title={session.branchName}>
        <span className="truncate text-xs">{session.branchName}</span>
        <GitBranch className="size-3.5 shrink-0" />
        {session.unread && <span className="size-2 shrink-0 rounded-full bg-destructive" />}
      </span>
      {/* 悬浮操作条：默认不占位不可点，hover 或键盘聚焦时浮现并盖在条目右侧。
          不透明底色放在容器而非按钮上，避免后续新增按钮时从间隙透出下层内容。 */}
      <div
        className={classNames(
          "pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-r-lg pr-1 pl-1.5 opacity-0 transition-opacity",
          "group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
          active ? "bg-secondary" : "bg-muted",
        )}
      >
        <button
          className="inline-flex size-6 items-center justify-center hover:text-foreground"
          title="归档会话"
          type="button"
          onClick={(mouseEvent) => {
            mouseEvent.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
