import { useTranslation } from "react-i18next";
import type { IssueItem } from "@/domain/issues";
import { issueTags } from "./issueConstants";

interface IssueLabelsProps {
  /** 远端条目显示平台标签（最多两个，其余 +N）；旧本地条目显示原分类。 */
  issue: IssueItem;
}

export function IssueLabels({ issue }: IssueLabelsProps) {
  const { t } = useTranslation(["issues"]);
  if (issue.labels?.length) {
    const shown = issue.labels.slice(0, 2);
    const rest = issue.labels.length - shown.length;
    return <>
      {shown.map((label) => <span key={label.name} className="issue-tag" data-tag="platform">{label.name}</span>)}
      {rest > 0 && <span className="issue-tag" data-tag="platform">+{rest}</span>}
      {issue.mentionedOnly && <span className="issue-tag" data-tag="mention">{t("issues:empty.mention")}</span>}
    </>;
  }
  return <>
    {issue.source === "local" && <span className="issue-tag" data-tag="local">{t("issues:source.local")}</span>}
    {issue.tag && <span className="issue-tag" data-tag={issue.tag}>{t(issueTags[issue.tag])}</span>}
    {issue.mentionedOnly && <span className="issue-tag" data-tag="mention">{t("issues:empty.mention")}</span>}
  </>;
}
