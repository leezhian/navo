import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskNoteMarkdown } from "@/components/tasks/workspace/TaskNoteMarkdown";
import { getIssueItem } from "@/services/integrationApi";
import { useAppNavigation } from "@/hooks/useAppNavigation";
import { useSettingsNavigationStore } from "@/stores/settingsNavigationStore";
import type { IssueItem } from "@/domain/issues";
import { issueFailureAction, issueNeedsRefresh, issueRelativeMinutes } from "@/utils/issueActions";

interface IssueRemoteDetailsProps {
  /** 任务或首页里的条目快照；有平台来源时按 60 秒规则自动刷新。 */
  issue: IssueItem;
  /** 外部触发的刷新序号（右键「刷新」）。 */
  refreshToken?: number;
  /** 刷新后的最新条目，供外层同步标题等。 */
  onLoaded?: (item: IssueItem) => void;
}

/** PR/Issue 的平台详情：正文、作者、负责人、PR 检查与合并、评论和更新时间。 */
export function IssueRemoteDetails({ issue, refreshToken = 0, onLoaded }: IssueRemoteDetailsProps) {
  const { t } = useTranslation(["issues", "common"]);
  const [item, setItem] = useState<IssueItem>(issue);
  const [loading, setLoading] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const navigation = useAppNavigation();
  const openIntegrations = useSettingsNavigationStore((state) => state.openIntegrations);
  const lastToken = useRef(refreshToken);
  const remote = issue.source !== "local" && Boolean(issue.providerId);

  async function load(refresh: boolean, page?: number) {
    if (!remote) return;
    setLoading(true);
    try {
      const next = await getIssueItem(issue.id, { refresh, commentsPage: page });
      if (next) { setItem(next); onLoaded?.(next); }
    } catch { setItem((current) => ({ ...current, fetchError: "unreachable" })); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    setItem(issue);
    setCommentsPage(1);
    const wantComments = issue.group === "ISSUE" && issue.providerId !== "linear";
    if (remote) void load(issueNeedsRefresh(issue), wantComments ? 1 : undefined);
  }, [issue.id]);

  useEffect(() => {
    if (refreshToken === lastToken.current) return;
    lastToken.current = refreshToken;
    void load(true, item.group === "ISSUE" && item.providerId !== "linear" ? commentsPage : undefined);
  }, [refreshToken]);

  const minutes = issueRelativeMinutes(item.lastFetchedAt);
  const action = issueFailureAction(item.fetchError);
  const people = (list?: IssueItem["assignees"]) => list?.map((person) => person.name || person.login).join(", ");
  const open = item.status !== "merged" && item.status !== "closed";

  return <div className="space-y-3 text-sm" data-testid="issue-remote-details">
    {remote && <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {loading && <Loader2 aria-label={t("common:actions.refresh")} className="size-3.5 animate-spin" />}
      {minutes !== null && <span title={item.lastFetchedAt}>{minutes < 1 ? t("issues:details.updatedJustNow") : t("issues:details.updatedMinutes", { count: minutes })}</span>}
    </div>}
    {item.fetchError && <div role="alert" className="rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive">
      <p>{(() => {
        const code = item.fetchError ?? "unreachable";
        const key = (["notFound", "forbidden", "disconnected", "unauthorized", "expired", "rejected", "rateLimited"].includes(code) ? code : "unreachable") as "notFound" | "forbidden" | "disconnected" | "unauthorized" | "expired" | "rejected" | "rateLimited" | "unreachable";
        return t(`issues:details.failure.${key}`);
      })()}</p>
      {action === "retry" && <Button size="sm" variant="link" className="h-auto px-0 text-xs" onClick={() => void load(true)}>{t("issues:details.retry")}</Button>}
      {(action === "reconnect" || action === "settings") && <Button size="sm" variant="link" className="h-auto px-0 text-xs" onClick={() => {
        openIntegrations(item.providerId);
        navigation.selectSection("settings");
      }}>{t(action === "reconnect" ? "issues:details.reconnect" : "issues:details.openSettings")}</Button>}
    </div>}
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {item.number && <><dt className="text-muted-foreground">{t("issues:details.number")}</dt><dd>{item.number}</dd></>}
      {item.nativeStatus && <><dt className="text-muted-foreground">{t("issues:details.nativeStatus")}</dt><dd>{item.nativeStatus}</dd></>}
      {item.author && <><dt className="text-muted-foreground">{t("issues:details.author")}</dt><dd>{item.author.name || item.author.login}{item.group === "PR" && item.authorKind ? ` · ${t(item.authorKind === "mine" ? "issues:details.mine" : "issues:details.review")}` : ""}</dd></>}
      {Boolean(item.assignees?.length) && <><dt className="text-muted-foreground">{t("issues:details.assignees")}</dt><dd>{people(item.assignees)}</dd></>}
      {item.milestone && <><dt className="text-muted-foreground">{t("issues:details.milestone")}</dt><dd>{item.milestone}</dd></>}
      {item.group === "PR" && item.headBranch && <><dt className="text-muted-foreground">{t("issues:details.branch")}</dt><dd className="font-mono">{item.headBranch}{item.baseBranch ? ` → ${item.baseBranch}` : ""}{item.isFork ? ` · ${t("issues:details.fork")}` : ""}</dd></>}
      {item.group === "PR" && open && item.checks && <><dt className="text-muted-foreground">{t("issues:details.checks")}</dt><dd>{t(`issues:details.checkState.${item.checks.state}`)}</dd></>}
      {item.group === "PR" && open && item.reviewApproved !== undefined && <><dt className="text-muted-foreground">{t("issues:details.review")}</dt><dd>{t(item.reviewApproved ? "issues:details.approved" : "issues:details.notApproved")}</dd></>}
      {item.group === "PR" && open && item.mergeState && <><dt className="text-muted-foreground">{t("issues:details.merge")}</dt><dd>{t(`issues:details.mergeState.${item.mergeState}`)}</dd></>}
    </dl>
    {item.body?.trim() && <div className="rounded-md border px-3 py-2"><TaskNoteMarkdown content={item.body} /></div>}
    {item.group === "ISSUE" && remote && <section className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">{t("issues:details.comments")}</h4>
      {item.providerId === "linear" ? <p className="text-xs text-muted-foreground">{t("issues:details.commentsLinear")}</p> : <>
        {item.commentsHasEarlier && <Button size="sm" variant="link" className="h-auto px-0 text-xs" disabled={loading} onClick={() => { const page = commentsPage + 1; setCommentsPage(page); void load(true, page); }}>{t("issues:details.loadEarlier")}</Button>}
        {[...(item.comments ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((comment) => <article key={comment.id} className="rounded-md border px-3 py-2">
          <p className="mb-1 text-xs text-muted-foreground">{comment.author?.name || comment.author?.login} · <time dateTime={comment.createdAt}>{comment.createdAt.slice(0, 16).replace("T", " ")}</time></p>
          <TaskNoteMarkdown content={comment.body} />
        </article>)}
        <Button size="sm" variant="link" className="h-auto px-0 text-xs" disabled={loading} onClick={() => void load(true, commentsPage)}>{t("issues:details.refreshComments")}</Button>
      </>}
    </section>}
  </div>;
}
