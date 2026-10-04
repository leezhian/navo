import { formatDate } from "@/i18n";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { issueStatuses, issueTags } from "./issueConstants";
import type { IssueItem } from "@/domain/issues";

interface IssueDetailsProps {
  /** 当前选中的 PR 或 ISSUE，详情不执行远程仓库操作。 */
  issue: IssueItem;
  /** 关闭右侧详情，恢复完整列表宽度。 */
  onClose: () => void;
}

export function IssueDetails({ issue, onClose }: IssueDetailsProps) {
  const { t: translate } = useTranslation(["common", "issues"]);
  const reducedMotion = useReducedMotion();

  return (
    <div className="task-details-inner">
      <header className="task-details-header">
        <h2 id="issue-details-heading">{issue.group} {translate("common:fields.details")}</h2>
        <Button aria-label={translate("issues:details.close")} className="task-details-close" size="icon" variant="ghost" onClick={onClose}>
          <X aria-hidden="true" size={17} strokeWidth={1.65} />
        </Button>
      </header>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={issue.id}
          className="task-details-body"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
          transition={{ duration: reducedMotion ? 0 : 0.14 }}
        >
          <h3 className="task-details-title">{issue.title}</h3>
          <dl className="task-details-metadata">
            <div><dt>{translate("common:fields.tag")}</dt><dd><span className="issue-tag" data-tag={issue.tag}>{translate(issueTags[issue.tag])}</span></dd></div>
            <div><dt>{translate("common:fields.project")}</dt><dd>{issue.projectName}</dd></div>
            <div><dt>{translate("common:fields.status")}</dt><dd><span className="issue-status" data-status={issue.status}>{translate(issueStatuses[issue.status])}</span></dd></div>
            <div><dt>{translate("common:fields.time")}</dt><dd><time dateTime={issue.date}>{formatDate(issue.date)}</time></dd></div>
          </dl>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
