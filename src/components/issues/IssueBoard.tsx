import { useTranslation } from "react-i18next";
import { CircleDot, GitPullRequest } from "lucide-react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import type { IssueDisplayOptions } from "@/domain/issueView";
import { issueGroups } from "./issueConstants";
import { IssueCard } from "./IssueCard";
import "./issue-board.css";

interface IssueBoardProps {
  /** 筛选并按属性排序后的条目，不支持手动拖拽。 */
  issues: IssueItem[];
  /** 与列表共享排序和字段显隐设置。 */
  display: IssueDisplayOptions;
  /** 含匹配条目的可见类型，固定按 PR、ISSUE 顺序展示。 */
  groups: IssueGroup[];
  /** 详情选中项，切换显示方式时保留。 */
  selectedIssueId: string | null;
  /** 打开独立右侧详情。 */
  onSelectIssue: (issueId: string) => void;
}

export function IssueBoard({ issues, display, groups, selectedIssueId, onSelectIssue }: IssueBoardProps) {
  const { t } = useTranslation(["common", "issues"]);
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="issue-board">
        <motion.div className="task-board issue-board" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(260px, 1fr))` }} layoutScroll>
          {issueGroups.filter((group) => groups.includes(group)).map((group) => {
            const GroupIcon = group === "PR" ? GitPullRequest : CircleDot;
            const groupIssues = issues.filter((issue) => issue.group === group);
            const headingId = "issue-board-" + group.toLowerCase();
            return (
              <section key={group} className="task-column" data-board-group={group} aria-labelledby={headingId}>
                <header className="task-column-header">
                  <GroupIcon aria-hidden="true" className="column-status-icon" size={17} strokeWidth={1.65} />
                  <h2 id={headingId}>{group}</h2>
                  <span className="column-task-count" aria-label={t("issues:counts.items", { count: groupIssues.length })}>{groupIssues.length}</span>
                </header>
                <motion.div className="task-column-content" layoutScroll>
                  {groupIssues.map((issue) => (
                    <motion.div key={issue.id} className="task-card-slot" data-board-item={issue.id} layout="position">
                      <IssueCard issue={issue} display={display} selected={selectedIssueId === issue.id} onSelect={() => onSelectIssue(issue.id)} />
                    </motion.div>
                  ))}
                </motion.div>
              </section>
            );
          })}
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}
