import { Fragment } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CircleDot, GitPullRequest } from "lucide-react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import type { IssueDisplayOptions } from "@/domain/issueView";
import { useBoardDrag } from "@/hooks/useBoardDrag";
import type { BoardDragPreview, BoardDropTarget } from "@/hooks/useBoardDrag";
import { useIssueStore } from "@/stores/issueStore";
import { issueGroups } from "./issueConstants";
import { IssueCard } from "./IssueCard";
import "./issue-board.css";

const LAYOUT_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

interface IssueBoardProps {
  /** 筛选和排序后的条目，不直接改变完整数据集合。 */
  issues: IssueItem[];
  /** 与列表共享排序和字段显隐设置。 */
  display: IssueDisplayOptions;
  /** 可见类型；固定按 PR、ISSUE 顺序展示。 */
  groups: IssueGroup[];
  /** 用于区分无数据和筛选无结果。 */
  filtered: boolean;
  /** 详情选中项，切换显示方式时保留。 */
  selectedIssueId: string | null;
  /** 打开独立右侧详情。 */
  onSelectIssue: (issueId: string) => void;
}

interface IssueColumnProps extends Omit<IssueBoardProps, "groups"> {
  /** 当前列类型，不允许拖动时变更。 */
  group: IssueGroup;
  /** 浮动预览决定源卡片隐藏与占位高度。 */
  dragPreview: BoardDragPreview<IssueItem> | null;
  /** 仅当前目标列接收插入位置。 */
  dropTarget: BoardDropTarget | null;
}

function IssueColumn({ group, issues, display, filtered, selectedIssueId, onSelectIssue, dragPreview, dropTarget }: IssueColumnProps) {
  const { t: translate } = useTranslation();
  const GroupIcon = group === "PR" ? GitPullRequest : CircleDot;
  const headingId = "issue-board-" + group.toLowerCase();
  const placeholder = <motion.div className="task-drop-placeholder" data-board-placeholder="" aria-hidden="true"
    layout="position" style={{ height: dragPreview?.height }} transition={{ layout: LAYOUT_TRANSITION }} />;
  return (
    <section className="task-column" data-board-group={group} aria-labelledby={headingId}>
      <header className="task-column-header">
        <GroupIcon aria-hidden="true" className="column-status-icon" size={17} strokeWidth={1.65} />
        <h2 id={headingId}>{group}</h2>
        <span className="column-task-count" aria-label={translate("{{count}} 个条目", { count: issues.length })}>{issues.length}</span>
      </header>
      <motion.div className="task-column-content" data-board-content="" layoutScroll>
        {issues.filter((issue) => issue.id !== dragPreview?.item.id).map((issue) => (
          <Fragment key={issue.id}>
            {dropTarget?.beforeItemId === issue.id && placeholder}
            <motion.div className="task-card-slot" data-board-item={issue.id} layout="position" layoutId={issue.id}
              transition={{ layout: LAYOUT_TRANSITION }}>
              <IssueCard issue={issue} display={display} selected={selectedIssueId === issue.id} onSelect={() => onSelectIssue(issue.id)} />
            </motion.div>
          </Fragment>
        ))}
        {dropTarget && dropTarget.beforeItemId === null && placeholder}
        {issues.length === 0 && <p className="ade-empty-state">{filtered ? translate("暂无匹配条目") : translate("暂无 {{group}}", { group })}</p>}
      </motion.div>
    </section>
  );
}

export function IssueBoard({ issues, display, groups, filtered, selectedIssueId, onSelectIssue }: IssueBoardProps) {
  const move = useIssueStore((state) => state.move);
  const { dragPreview, dropTarget, dropDuration, pointerHandlers } = useBoardDrag({
    items: issues,
    getGroup: (issue) => issue.group,
    allowCrossGroup: false,
    onMove: (issueId, target) => move(issueId, target.group as IssueGroup, target.beforeItemId),
    onItemClick: onSelectIssue,
  });
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="issue-board">
        <motion.div className="task-board issue-board" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(260px, 1fr))` }}
          layoutScroll {...(display.order === "default" ? pointerHandlers : {})}>
          {issueGroups.filter((group) => groups.includes(group)).map((group) => (
            <IssueColumn key={group} group={group} issues={issues.filter((issue) => issue.group === group)} display={display}
              filtered={filtered} selectedIssueId={selectedIssueId} onSelectIssue={onSelectIssue}
              dragPreview={dragPreview} dropTarget={dropTarget?.group === group ? dropTarget : null} />
          ))}
        </motion.div>
        {dragPreview && createPortal(
          <motion.div aria-hidden="true" className="task-drag-overlay" initial={false}
            animate={{ x: dragPreview.left, y: dragPreview.top, width: dragPreview.width, height: dragPreview.height }}
            transition={dragPreview.settling ? { duration: dropDuration, ease: LAYOUT_TRANSITION.ease } : { duration: 0 }}>
            <IssueCard issue={dragPreview.item} display={display} />
          </motion.div>, document.body,
        )}
      </LayoutGroup>
    </MotionConfig>
  );
}
