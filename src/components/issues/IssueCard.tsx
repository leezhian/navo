import { useTranslation } from "react-i18next";
import type { IssueItem } from "@/domain/issues";
import type { IssueDisplayOptions } from "@/domain/issueView";
import { formatDate } from "@/i18n";
import { issueStatuses, issueTags } from "./issueConstants";

interface IssueCardProps {
  /** PR 或 ISSUE 数据，类型不因拖拽改变。 */
  issue: IssueItem;
  /** 与列表共用字段显隐选项。 */
  display: IssueDisplayOptions;
  /** 卡片是否对应当前详情。 */
  selected?: boolean;
  /** 点按或键盘打开详情；浮动预览不传入。 */
  onSelect?: () => void;
}

export function IssueCard({ issue, display, selected = false, onSelect }: IssueCardProps) {
  const { t: translate } = useTranslation();
  const showMetadata = display.showProject || display.showStatus || display.showDate;
  return (
    <article className="task-card issue-card" draggable={false} data-selected={selected}
      role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      aria-label={onSelect ? translate("查看{{group}}：{{title}}", { group: issue.group, title: issue.title }) : undefined}
      onClick={(event) => { if (display.order !== "default" || event.detail === 0) onSelect?.(); }}
      onKeyDown={(event) => {
        if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onSelect();
      }}>
      <div className="issue-card-heading">
        {display.showTag && <span className="issue-tag" data-tag={issue.tag}>{translate(issueTags[issue.tag])}</span>}
        <h3 className="task-title" title={issue.title}>{issue.title}</h3>
      </div>
      {showMetadata && <div className="issue-card-metadata">
        {display.showProject && <span className="issue-project" title={issue.projectName}>{issue.projectName}</span>}
        {display.showStatus && <span className="issue-status" data-status={issue.status}>{translate(issueStatuses[issue.status])}</span>}
        {display.showDate && <time dateTime={issue.date}>{formatDate(issue.date)}</time>}
      </div>}
    </article>
  );
}
