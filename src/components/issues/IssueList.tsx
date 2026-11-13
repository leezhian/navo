import { formatDate } from "@/i18n";
import { useTranslation } from "react-i18next";
import { ChevronDown, CircleDot, GitPullRequest } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Collapsible } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { issueGroups, issueStatuses, issueTags } from "./issueConstants";
import { useIssueStore } from "@/stores/issueStore";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import type { IssueDisplayOptions } from "@/domain/issueView";
import { useIssueView } from "@/hooks/useIssueView";
import { IssueDetails } from "./IssueDetails";
import { IssueToolbar } from "./IssueToolbar";
import { IssueBoard } from "./IssueBoard";
import { IssueEmptyState } from "./IssueEmptyState";
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
  /** 当前选中的条目标识，未打开详情时为 null。 */
  selectedIssueId: string | null;
  /** 打开指定条目的详情，保持分组的展开状态。 */
  onSelectIssue: (issueId: string) => void;
}

function IssueRow({ issue, selected, onSelect, display }: IssueRowProps) {
  const { t: translate } = useTranslation(["common", "issues"]);
  const status = translate(issueStatuses[issue.status]);
  const showMetadata = display.showProject || display.showStatus || display.showDate;

  return (
    <li>
      <Button className="issue-row" variant="ghost" aria-pressed={selected} aria-label={translate("issues:actions.viewLabel", { group: issue.group, title: issue.title })} data-selected={selected} onClick={onSelect}>
      <span className="issue-row-main">
        {display.showTag && <span className="issue-tag" data-tag={issue.tag}>{translate(issueTags[issue.tag])}</span>}
        <span className="issue-row-title" title={issue.title}>{issue.title}</span>
      </span>
      {showMetadata && <span className="issue-row-metadata">
        {display.showProject && <span className="issue-project" title={issue.projectName}>{issue.projectName}</span>}
        {display.showStatus && <span className="issue-status" data-status={issue.status}>{status}</span>}
        {display.showDate && <time dateTime={issue.date}>{formatDate(issue.date)}</time>}
      </span>}
      </Button>
    </li>
  );
}

function IssueSection({ group, icon: GroupIcon, issues, visible, display, selectedIssueId, onSelectIssue }: IssueSectionProps) {
  const { t: translate } = useTranslation(["common", "issues"]);
  const headingId = "issue-group-" + group.toLowerCase();
  const [isOpen, setIsOpen] = useState(true);
  const reducedMotion = useReducedMotion();

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen} asChild>
      <section className="issue-group" aria-labelledby={headingId} hidden={!visible}>
        <h2 className="issue-group-heading" id={headingId}>
          <Collapsible.Trigger asChild>
            <Button className="issue-group-header" variant="ghost" aria-label={translate("common:groups.label", { group })}>
              <ChevronDown aria-hidden="true" className="issue-group-chevron" size={14} strokeWidth={1.65} />
              <GroupIcon aria-hidden="true" size={17} strokeWidth={1.65} />
              <span className="issue-group-title">{group}</span>
              <span className="issue-group-count" aria-label={translate("issues:counts.items", { count: issues.length })}>{issues.length}</span>
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
  const { t: translate } = useTranslation(["common", "issues"]);
  const issues = useIssueStore((state) => state.items);
  const refresh = useIssueStore((state) => state.refresh);
  const view = useIssueView(issues);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const selectedIssue = view.visibleIssues.find((issue) => issue.id === selectedIssueId);
  const pullRequests = view.visibleIssues.filter((issue) => issue.group === "PR");
  const issueItems = view.visibleIssues.filter((issue) => issue.group === "ISSUE");
  const visibleGroups = issueGroups.filter((group) => group === "PR" ? pullRequests.length > 0 : issueItems.length > 0);
  const isEmpty = view.visibleIssues.length === 0;

  return (
    <ResizableWorkspace
      details={selectedIssue ? <IssueDetails issue={selectedIssue} onClose={() => setSelectedIssueId(null)} /> : null}
      detailsHeadingId="issue-details-heading" listLabel={translate(view.display.mode === "board" ? "common:display.board" : "common:display.list")}>
      <div className="issue-panel-content">
        <IssueToolbar issues={issues} filters={view.filters} display={view.display} projectNames={view.projectNames} hasFilters={view.hasFilters}
          onFiltersChange={view.setFilters} onDisplayChange={view.setDisplay} onClearFilters={view.clearFilters} onRefresh={refresh} />
        {isEmpty && <IssueEmptyState hasItems={issues.length > 0} />}
        {!isEmpty && view.display.mode === "board" && <IssueBoard issues={view.visibleIssues} display={view.display}
          groups={visibleGroups}
          selectedIssueId={selectedIssueId} onSelectIssue={setSelectedIssueId} />}
        <div className="issue-list" hidden={isEmpty || view.display.mode !== "list"}>
          <div className="issue-list-content">
            <IssueSection group="PR" icon={GitPullRequest} issues={pullRequests} visible={pullRequests.length > 0} display={view.display}
              selectedIssueId={selectedIssueId} onSelectIssue={setSelectedIssueId} />
            <IssueSection group="ISSUE" icon={CircleDot} issues={issueItems} visible={issueItems.length > 0} display={view.display}
              selectedIssueId={selectedIssueId} onSelectIssue={setSelectedIssueId} />
          </div>
        </div>
      </div>
    </ResizableWorkspace>
  );
}
