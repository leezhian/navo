import { useMemo, useRef, useState } from "react";
import { filterSessions, groupSessionsByProject } from "@/domain/sessionGroups";
import type { SessionGroup } from "@/domain/sessionGroups";
import { AGENT_TYPES, type AgentType, type ReviewSession } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
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
  /** 会话摘要，展示标题、Agent、分支名和未读状态。 */
  session: ReviewSession;
  /** 归档当前会话；仅在条目 hover 时按钮可见，点击不触发会话选中。 */
  onArchive: () => void;
  /** 点击会话条目时触发选择。 */
  onSelect: () => void;
}

/**
 * 标题滚动的统一速度曲线：所有条目共享固定的加速时长与恒定巡航速度，
 * 距离只影响总时长，不影响手感——长短标题的「0 → 匀速」过程完全一致。
 */
const TITLE_SCROLL_SPEED_PX_PER_MS = 0.08;
const TITLE_SCROLL_RAMP_MS = 300;
const TITLE_SCROLL_START_DELAY_MS = 400;

/**
 * 由滚动距离推导时长与缓动曲线。贝塞尔曲线按总时长归一化，若直接用固定曲线，
 * 加速段会随总时长伸缩（短标题急、长标题拖）；这里反向求控制点，
 * 使加速段固定占用 TITLE_SCROLL_RAMP_MS，其余时间以恒定速度巡航到末尾。
 */
function getTitleScrollTransition(distancePx: number) {
  // 加速段（0 → 巡航速度线性提速）内走过的距离。
  const rampDistancePx = (TITLE_SCROLL_SPEED_PX_PER_MS * TITLE_SCROLL_RAMP_MS) / 2;

  // 距离太短，全程都在加速段内：用固定短时长的 ease-in 直接收尾。
  if (distancePx <= rampDistancePx) {
    return { durationMs: TITLE_SCROLL_RAMP_MS, easing: "ease-in" };
  }

  const durationMs = TITLE_SCROLL_RAMP_MS / 2 + distancePx / TITLE_SCROLL_SPEED_PX_PER_MS;
  // 加速段结束点在归一化时间/进度中的位置，以及其后的匀速段斜率。
  const rampEndTime = TITLE_SCROLL_RAMP_MS / durationMs;
  const rampEndProgress = rampDistancePx / distancePx;
  const cruiseSlope = (1 - rampEndProgress) / (1 - rampEndTime);
  // 第二控制点落在匀速直线上，保证尾段速度恒定；第一控制点纵向为 0，保证起步速度为 0。
  const controlX = (rampEndTime + 1) / 2;
  const controlY = 1 - cruiseSlope * (1 - controlX);

  return {
    durationMs,
    easing: `cubic-bezier(${rampEndTime.toFixed(3)}, 0, ${controlX.toFixed(3)}, ${controlY.toFixed(3)})`,
  };
}

function SessionItem({ active, session, onArchive, onSelect }: SessionItemProps) {
  // 历史事件可能没有标题：首行退化为分支名，次行则不再重复展示分支。
  const title = session.title ?? session.branchName;
  const showBranchMeta = Boolean(session.title);
  const titleTextRef = useRef<HTMLSpanElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  // 标题向左滚动的位移（负值）；0 表示未截断或未 hover，不滚动。
  const [titleShiftPx, setTitleShiftPx] = useState(0);
  const scrollTransition = getTitleScrollTransition(Math.abs(titleShiftPx));

  // hover 进入时实测截断量：未超出一行的标题保持不动；
  // 超出的滚动到文本末尾（终点避开悬浮操作条的遮挡区）后停住。
  function startTitleScroll() {
    const textElement = titleTextRef.current;
    const containerWidth = textElement?.parentElement?.clientWidth ?? 0;
    const overflowWidth = textElement ? textElement.scrollWidth - containerWidth : 0;

    if (overflowWidth > 0) {
      setTitleShiftPx(-(overflowWidth + (actionBarRef.current?.offsetWidth ?? 0)));
    }
  }

  return (
    // 条目内含归档按钮，button 不允许嵌套，改用带按钮语义的 div 承载整行选中。
    <div
      className={classNames(
        "group relative flex w-full cursor-pointer flex-col gap-0.5 rounded-lg py-1.5 pr-2 pl-7 text-left",
        active ? "bg-secondary" : "hover:bg-muted dark:hover:bg-muted/50",
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
      onMouseEnter={startTitleScroll}
      onMouseLeave={() => setTitleShiftPx(0)}
    >
      <span className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 overflow-hidden">
          <span
            ref={titleTextRef}
            className={classNames(
              // 两种状态都用 block 布局，避免 inline-block 随 overflow 切换基线导致整行抖动。
              "block text-sm text-foreground transition-transform",
              // 静止时按原样截断展示省略号；滚动期间放开为自然宽度，由外层容器裁剪。
              titleShiftPx === 0 ? "max-w-full truncate" : "w-max whitespace-nowrap",
            )}
            style={{
              transform: `translateX(${titleShiftPx}px)`,
              // 移出 hover（归零）时过渡时长为 0：立即恢复原状，不做回滚动画。
              transitionDuration:
                titleShiftPx === 0 ? "0ms" : `${Math.round(scrollTransition.durationMs)}ms`,
              transitionDelay: titleShiftPx === 0 ? "0ms" : `${TITLE_SCROLL_START_DELAY_MS}ms`,
              transitionTimingFunction: scrollTransition.easing,
            }}
            title={title}
          >
            {title}
          </span>
        </span>
        {session.unread && <span className="size-2 shrink-0 rounded-full bg-destructive" />}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="shrink-0">{session.agent}</span>
        {showBranchMeta && (
          <>
            <span className="shrink-0">·</span>
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate" title={session.branchName}>
              {session.branchName}
            </span>
          </>
        )}
      </span>
      {/* 悬浮操作条：默认不占位不可点，hover 或键盘聚焦时浮现并盖在条目右侧。
          不透明底色放在容器而非按钮上，避免后续新增按钮时从间隙透出下层内容。 */}
      <div
        ref={actionBarRef}
        className={classNames(
          "pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-r-lg pr-1 pl-1.5 opacity-0 transition-opacity",
          "group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
          active ? "bg-secondary" : "bg-muted",
        )}
      >
        {/* 压掉 ghost 变体的 hover 底色：操作条容器已有底色，按钮 hover 只变图标颜色。 */}
        <IconTooltip
          className="size-6 hover:bg-transparent dark:hover:bg-transparent"
          label="归档会话"
          onClick={(mouseEvent) => {
            mouseEvent.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="size-3.5" />
        </IconTooltip>
      </div>
    </div>
  );
}
