import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import { INTEGRATION_PROVIDER_IDS } from "../../shared/integrationTypes";
import type { IntegrationConnectInput, IntegrationProviderId } from "../../shared/integrationTypes";
import { isIssueItem } from "../../utils/adeDataValidation";
import { getIntegrationService } from "../services/integrations/integrationRuntime";
import { getTaskIssueLinker } from "./taskHandlers";

function isProviderId(value: unknown): value is IntegrationProviderId {
  return typeof value === "string" && (INTEGRATION_PROVIDER_IDS as readonly string[]).includes(value);
}

function parseConnectInput(value: unknown): IntegrationConnectInput {
  if (!value || typeof value !== "object") throw new Error("INTEGRATION_INVALID");
  const input = value as Record<string, unknown>;
  if (!isProviderId(input.id)) throw new Error("INTEGRATION_INVALID");
  if (input.method === "oauth") return { id: input.id, method: "oauth" };
  if (input.method === "pat") {
    if (typeof input.token !== "string") throw new Error("INTEGRATION_INVALID_TOKEN");
    if (input.host !== undefined && typeof input.host !== "string") throw new Error("INTEGRATION_INVALID_HOST");
    return { id: input.id, method: "pat", token: input.token, host: input.host };
  }
  throw new Error("INTEGRATION_INVALID");
}

export function registerIntegrationHandlers() {
  const service = getIntegrationService();
  ipcMain.handle(ipcChannels.integrationsList, () => service.listStatuses());
  ipcMain.handle(ipcChannels.integrationsConnect, (_event, value: unknown) => service.connect(parseConnectInput(value)));
  ipcMain.handle(ipcChannels.integrationsCancel, (_event, id: unknown) => {
    if (!isProviderId(id)) throw new Error("INTEGRATION_INVALID");
    return service.cancel(id);
  });
  ipcMain.handle(ipcChannels.integrationsDisconnect, (_event, id: unknown) => {
    if (!isProviderId(id)) throw new Error("INTEGRATION_INVALID");
    return service.disconnect(id);
  });
  ipcMain.handle(ipcChannels.integrationsRefreshStatuses, () => service.refreshStatuses());
  ipcMain.handle(ipcChannels.integrationsAuthState, (_event, id: unknown) => {
    if (!isProviderId(id)) throw new Error("INTEGRATION_INVALID");
    return service.authState(id);
  });
  ipcMain.handle(ipcChannels.issuesList, (_event, options: unknown) => {
    const refresh = Boolean(options && typeof options === "object" && (options as { refresh?: unknown }).refresh === true);
    return service.listMine({ refresh }).then((result) => {
      const pullRequests = result.items.filter((item) => item.group === "PR");
      if (pullRequests.length) void getTaskIssueLinker()?.autolink(pullRequests).catch(() => undefined);
      return result;
    });
  });
  ipcMain.handle(ipcChannels.issuesGet, (_event, id: unknown, options: unknown) => {
    if (typeof id !== "string" || !id || id.length > 512) throw new Error("ISSUE_INVALID");
    const refresh = Boolean(options && typeof options === "object" && (options as { refresh?: unknown }).refresh === true);
    const commentsPage = options && typeof options === "object" && typeof (options as { commentsPage?: unknown }).commentsPage === "number"
      ? Math.max(1, Math.min(100, Math.floor((options as { commentsPage: number }).commentsPage)))
      : undefined;
    return service.getItem(id, { refresh, commentsPage }).then(async (item) => {
      if (refresh && item) await getTaskIssueLinker()?.refreshLinkedItem(item);
      return item;
    });
  });
  ipcMain.handle(ipcChannels.issuesResolveUrl, (_event, value: unknown) => {
    if (typeof value !== "string" || value.length > 4096) throw new Error("ISSUE_INVALID");
    return service.resolveQuery(value);
  });
  const idText = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 512;
  ipcMain.handle(ipcChannels.issuesEnsureNote, (_event, taskId: unknown, issueId: unknown) => {
    if (!idText(taskId) || !idText(issueId)) throw new Error("ISSUE_INVALID");
    const linker = getTaskIssueLinker();
    return linker ? linker.ensureIssueNote(taskId as string, issueId as string) : "skipped";
  });
  ipcMain.handle(ipcChannels.issuesWorktreesForPullRequest, async (_event, taskId: unknown, pullRequestId: unknown) => {
    if (!idText(taskId) || !idText(pullRequestId)) throw new Error("ISSUE_INVALID");
    const linker = getTaskIssueLinker();
    if (!linker) return [];
    const item = await service.getItem(pullRequestId as string).catch(() => null) ?? await linker.findLink(taskId as string, pullRequestId as string);
    if (!item || item.group !== "PR") return [];
    return (await linker.worktreesForPullRequest(taskId as string, item)).map((worktree) => ({ resourceId: worktree.resourceId, name: worktree.name, branch: worktree.branch }));
  });
  ipcMain.handle(ipcChannels.issuesPullRequestForWorktree, (_event, taskId: unknown, resourceId: unknown) => {
    if (!idText(taskId) || !idText(resourceId)) throw new Error("ISSUE_INVALID");
    return getTaskIssueLinker()?.pullRequestForWorktree(taskId as string, resourceId as string) ?? null;
  });
  ipcMain.handle(ipcChannels.issuesImportLocal, (_event, value: unknown) => {
    if (!Array.isArray(value) || value.length > 2000) throw new Error("ISSUE_INVALID");
    return service.importLocalItems(value.filter(isIssueItem));
  });
}
