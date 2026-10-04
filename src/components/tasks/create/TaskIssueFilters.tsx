import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskIssueFilters as FilterValues, TaskLinkFilter, PullRequestStateFilter } from "@/utils/taskIssuePicker";
import type { IssueGroup } from "@/domain/issues";

interface TaskIssueFiltersProps {
  /** 只有关联 PR 时显示状态筛选，不影响关联 Issue。 */
  group: IssueGroup;
  /** 服务商与仓库均来自当前类别完整条目，不受搜索和关联状态影响。 */
  providers: string[];
  repositories: string[];
  /** 当前筛选值，空服务商或仓库表示不限。 */
  value: FilterValues;
  /** 仅修改展示条件，保留已勾选条目。 */
  onChange: Dispatch<SetStateAction<FilterValues>>;
}

const ANY_VALUE = "__any__";

export function TaskIssueFilters({ group, providers, repositories, value, onChange }: TaskIssueFiltersProps) {
  const { t } = useTranslation(["common", "taskCreate", "issues"]);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Select value={value.provider ? "provider:" + value.provider : ANY_VALUE}
        onValueChange={(selected) => onChange((current) => ({ ...current, provider: selected === ANY_VALUE ? "" : selected.slice(9) }))}>
        <SelectTrigger aria-label={t("taskCreate:filters.provider.label")} className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>{t("taskCreate:filters.provider.any")}</SelectItem>
          {providers.map((provider) => <SelectItem key={provider} value={"provider:" + provider}>{provider}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.repository ? "repo:" + value.repository : ANY_VALUE}
        onValueChange={(selected) => onChange((current) => ({ ...current, repository: selected === ANY_VALUE ? "" : selected.slice(5) }))}>
        <SelectTrigger aria-label={t("taskCreate:filters.repository.label")} className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>{t("taskCreate:filters.repository.any")}</SelectItem>
          {repositories.map((repository) => <SelectItem key={repository} value={"repo:" + repository}>{repository}</SelectItem>)}
        </SelectContent>
      </Select>
      {group === "PR" && <Select value={value.prState} onValueChange={(prState: PullRequestStateFilter) => onChange((current) => ({ ...current, prState }))}>
        <SelectTrigger aria-label={t("taskCreate:filters.pullRequestState.label")} className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t("taskCreate:filters.pullRequestState.any")}</SelectItem>
          <SelectItem value="open">{t("taskCreate:filters.pullRequestState.open")}</SelectItem>
          <SelectItem value="draft">{t("issues:statuses.draft")}</SelectItem>
        </SelectContent>
      </Select>}
      <Select value={value.taskLink} onValueChange={(taskLink: TaskLinkFilter) => onChange((current) => ({ ...current, taskLink }))}>
        <SelectTrigger aria-label={t("taskCreate:filters.taskLink.label")} className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t("taskCreate:filters.taskLink.any")}</SelectItem>
          <SelectItem value="linked">{t("taskCreate:filters.taskLink.linked")}</SelectItem>
          <SelectItem value="unlinked">{t("taskCreate:filters.taskLink.unlinked")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
