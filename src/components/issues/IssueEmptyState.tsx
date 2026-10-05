import { useTranslation } from "react-i18next";

interface IssueEmptyStateProps {
  /** 原始数据存在但被筛选隐藏时，只展示无匹配提示。 */
  hasItems: boolean;
}

export function IssueEmptyState({ hasItems }: IssueEmptyStateProps) {
  const { t } = useTranslation(["common", "issues"]);
  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" role="status">
    <div className="max-w-md text-center">
      <p className="text-sm font-medium">{t(hasItems ? "issues:empty.matches" : "issues:empty.assignedTitle")}</p>
      {!hasItems && <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("issues:empty.assignedDescription")}</p>}
    </div>
  </div>;
}
