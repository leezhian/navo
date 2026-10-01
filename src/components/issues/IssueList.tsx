import { ChevronDown, CircleDot, GitPullRequest } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Collapsible } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { issueStatuses, issueTags } from "./issueConstants";
import { loadIssueItems } from "@/services/adeData";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import type { IssueDisplayOptions } from "@/domain/issueView";
import { useIssueView } from "@/hooks/useIssueView";
import { IssueDetails } from "./IssueDetails";
import { IssueToolbar } from "./IssueToolbar";
import { ResizableWorkspace } from "@/components/layout/ResizableWorkspace";


interface IssueRowProps {
  /** 左右布局的条目数据，不附加任务卡片或操作按钮。 */
  issue: IssueItem;
  /** 当前条目是否对应右侧已打开的详情。 */
  selected: boolean;
  /** 点击条目或通过键盘激活时打开详情。 */
  onSelect: () => void;
  /** 列表字段显隐，详情仍显示完整元信息。 */
  display: IssueDisplayOptions;
}

interface IssueSectionProps {
  /** 分组标题，仅使用 PR 或 ISSUE。 */
  group: IssueGroup;
  /** 分组标题左侧的辅助图标。 */
  icon: LucideIcon;
  /** 当前分组筛选和排序后的条目，数量从集合直接计算。 */
  issues: IssueItem[];
  /** 分组筛选仅隐藏分组，不卸载或重置折叠状态。 */
  visible: boolean;
  /** 当前列表展示设置。 */
  display: IssueDisplayOptions;
  /** 当前存在过滤条件，用于区分无数据和无匹配结果。 */
  filtered: boolean;
  /** 当前选中的条目标识，未打开详情时为 null。 */
  selectedIssueId: string | null;
  /** 打开指定条目的详情，保持分组的展开状态。 */
  onSelectIssue: (issueId: string) => void;
}

function IssueRow({ issue, selected, onSelect, display }: IssueRowProps) {
  const status = issueStatuses[issue.status];
  const showMetadata = display.showProject || display.showStatus || display.showDate;

  return (
    <li>
      <Button className="issue-row" variant="ghost" aria-pressed={selected} aria-label={`查看${issue.group}：${issue.title}`} data-selected={selected} onClick={onSelect}>
      <span className="issue-row-main">
        {display.showTag && <span className="issue-tag" data-tag={issue.tag}>{issueTags[issue.tag]}</span>}
        <span className="issue-row-title" title={issue.title}>{issue.title}</span>
      </span>
      {showMetadata && <span className="issue-row-metadata">
        {display.showProject && <span className="issue-project" title={issue.projectName}>{issue.projectName}</span>}
        {display.showStatus && <span className="issue-status" data-status={issue.status}>{status}</span>}
        {display.showDate && <time dateTime={issue.date}>{issue.date.replace(/-/g, ".")}</time>}
      </span>}
      </Button>
    </li>
  );
}

function IssueSection({ group, icon: GroupIcon, issues, visible, display, filtered, selectedIssueId, onSelectIssue }: IssueSectionProps) {
  const headingId = "issue-group-" + group.toLowerCase();
  const [isOpen, setIsOpen] = useState(true);
  const reducedMotion = useReducedMotion();

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen} asChild>
      <section className="issue-group" aria-labelledby={headingId} hidden={!visible}>
        <h2 className="issue-group-heading" id={headingId}>
          <Collapsible.Trigger asChild>
            <Button className="issue-group-header" variant="ghost" aria-label={`${group} 分组`}>
              <ChevronDown aria-hidden="true" className="issue-group-chevron" size={14} strokeWidth={1.65} />
              <GroupIcon aria-hidden="true" size={17} strokeWidth={1.65} />
              <span className="issue-group-title">{group}</span>
              <span className="issue-group-count" aria-label={`${issues.length} 个条目`}>{issues.length}</span>
            </Button>
          </Collapsible.Trigger>
        </h2>
        <AnimatePresence initial={false}>
          {isOpen && (
            <Collapsible.Content forceMount asChild>
              <motion.div
                className="issue-group-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                inert={!isOpen}
                transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <ul className="issue-group-list">
                  {issues.length === 0 && <li className="ade-empty-state">{filtered ? "暂无匹配条目" : `暂无 ${group}`}</li>}
                  {issues.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} selected={selectedIssueId === issue.id} onSelect={() => onSelectIssue(issue.id)} display={display} />
                  ))}
                </ul>
              </motion.div>
            </Collapsible.Content>
          )}
        </AnimatePresence>
      </section>
    </Collapsible.Root>
  );
}

export function IssueList() {
  const [issues] = useState(loadIssueItems);
  const view = useIssueView(issues);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const selectedIssue = view.visibleIssues.find((issue) => issue.id === selectedIssueId);
  const showPR = view.filters.groups.length === 0 || view.filters.groups.includes("PR");
  const showIssue = view.filters.groups.length === 0 || view.filters.groups.includes("ISSUE");
  const pullRequests = view.visibleIssues.filter((issue) => issue.group === "PR");
  const issueItems = view.visibleIssues.filter((issue) => issue.group === "ISSUE");

  return (
    <ResizableWorkspace
      details={selectedIssue ? <IssueDetails issue={selectedIssue} onClose={() => setSelectedIssueId(null)} /> : null}
      detailsHeadingId="issue-details-heading" listLabel="列表">
      <div className="issue-panel-content">
        <IssueToolbar issues={issues} filters={view.filters} display={view.display} projectNames={view.projectNames} hasFilters={view.hasFilters}
          onFiltersChange={view.setFilters} onDisplayChange={view.setDisplay} onClearFilters={view.clearFilters} />
        <div className="issue-list">
          <div className="issue-list-content">
            <IssueSection group="PR" icon={GitPullRequest} issues={pullRequests} visible={showPR} display={view.display} filtered={view.hasFilters}
              selectedIssueId={selectedIssueId} onSelectIssue={setSelectedIssueId} />
            <IssueSection group="ISSUE" icon={CircleDot} issues={issueItems} visible={showIssue} display={view.display} filtered={view.hasFilters}
              selectedIssueId={selectedIssueId} onSelectIssue={setSelectedIssueId} />
          </div>
        </div>
      </div>
    </ResizableWorkspace>
  );
}
