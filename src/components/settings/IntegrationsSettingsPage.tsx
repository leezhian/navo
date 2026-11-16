import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIntegrationStore } from "@/stores/integrationStore";
import { useSettingsNavigationStore } from "@/stores/settingsNavigationStore";
import { INTEGRATION_PROVIDERS, INTEGRATION_REQUIRED_SCOPES } from "@/shared/integrationTypes";
import type { IntegrationProviderId, IntegrationStatus } from "@/shared/integrationTypes";
import { SettingsList, SettingsPageHeader, SettingsRow } from "./settingsPrimitives";
import { IntegrationProviderIcon } from "./IntegrationProviderIcon";

function tokenCreateUrl(id: IntegrationProviderId, host?: string) {
  if (id === "github") return "https://github.com/settings/tokens";
  if (id === "github-enterprise" && host) return `https://${host}/settings/tokens`;
  if (id === "gitlab") return "https://gitlab.com/-/user_settings/personal_access_tokens";
  if (id === "gitlab-self-hosted" && host) return `https://${host}/-/user_settings/personal_access_tokens`;
  if (id === "linear") return "https://linear.app/settings/api";
  return undefined;
}

function statusDescription(provider: IntegrationStatus, t: (key: string, options?: Record<string, string>) => string) {
  if (!provider.connected) return t("settings:integrations.disconnected");
  const parts: string[] = [];
  if (provider.account?.login) parts.push(t("settings:integrations.connectedAs", { login: provider.account.login }));
  if (provider.host && (provider.id === "github-enterprise" || provider.id === "gitlab-self-hosted")) {
    parts.push(t("settings:integrations.host", { host: provider.host }));
  }
  if (provider.missingScopes?.length) parts.push(t("settings:integrations.missingScopes", { scopes: provider.missingScopes.join(", ") }));
  if (provider.warning === "expired") parts.push(t("settings:integrations.warningExpired"));
  if (provider.warning === "unreachable") parts.push(t("settings:integrations.warningUnreachable"));
  if (provider.warning === "unreadable") parts.push(t("settings:integrations.warningUnreadable"));
  if (provider.warning === "orgDenied" && provider.deniedOrganizations?.length) {
    parts.push(t("settings:integrations.warningOrgDenied", { orgs: provider.deniedOrganizations.join(", ") }));
  }
  return parts.join(" · ") || t("settings:integrations.disconnected");
}

export function IntegrationsSettingsPage() {
  const { t } = useTranslation(["common", "settings"]);
  const highlightProvider = useSettingsNavigationStore((state) => state.highlightProvider);
  const clearHighlight = useSettingsNavigationStore((state) => state.clearHighlight);
  const {
    providers, loading, authSession, authError, tokenCheck, refresh, refreshStatuses, connect, cancel, disconnect, pollAuth, clearAuth,
  } = useIntegrationStore();
  const [dialogId, setDialogId] = useState<IntegrationProviderId | null>(null);
  const [mode, setMode] = useState<"oauth" | "pat">("oauth");
  const [token, setToken] = useState("");
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState<IntegrationStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!highlightProvider) return;
    const row = document.querySelector(`[data-integration-id="${highlightProvider}"]`);
    row?.scrollIntoView({ block: "center" });
    clearHighlight();
  }, [highlightProvider, clearHighlight, providers]);

  useEffect(() => {
    if (!authSession) return;
    const timer = window.setInterval(() => { void pollAuth(authSession.id); }, 1500);
    return () => window.clearInterval(timer);
  }, [authSession, pollAuth]);

  useEffect(() => {
    if (authSession && dialogId === authSession.id && providers.find((item) => item.id === authSession.id)?.connected) {
      setDialogId(null);
      clearAuth();
    }
  }, [providers, authSession, dialogId, clearAuth]);

  useEffect(() => {
    if (authError === "secretRequired" || authError === "INTEGRATION_OAUTH_SECRET_REQUIRED") setMode("pat");
  }, [authError]);

  const providerMeta = useMemo(() => Object.fromEntries(INTEGRATION_PROVIDERS.map((item) => [item.id, item])), []);

  async function openConnect(id: IntegrationProviderId) {
    const meta = providerMeta[id];
    setDialogId(id);
    setToken("");
    setHost("");
    setCopied(false);
    clearAuth();
    if (!meta.cloud) {
      setMode("pat");
      return;
    }
    if (!providers.find((item) => item.id === id)?.oauthAvailable) {
      setMode("pat");
      return;
    }
    setMode("oauth");
    setBusy(true);
    try { await connect(id, { method: "oauth" }); }
    catch { /* store keeps authError */ }
    finally { setBusy(false); }
  }

  async function submitPat() {
    if (!dialogId) return;
    setBusy(true);
    try {
      await connect(dialogId, { method: "pat", token, host: host || undefined });
      if (useIntegrationStore.getState().tokenCheck === "verified" || useIntegrationStore.getState().tokenCheck === "tls" || useIntegrationStore.getState().tokenCheck === "unreachable") {
        if (useIntegrationStore.getState().tokenCheck !== "rejected") {
          /* keep dialog briefly to show check copy, then close on verified */
          if (useIntegrationStore.getState().tokenCheck === "verified") {
            setDialogId(null);
            clearAuth();
          }
        }
      }
    } catch { /* store keeps error */ }
    finally { setBusy(false); }
  }

  async function retryOauth() {
    if (!dialogId) return;
    setBusy(true);
    try { await connect(dialogId, { method: "oauth" }); }
    finally { setBusy(false); }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  const active = dialogId ? providers.find((item) => item.id === dialogId) : null;
  const meta = dialogId ? providerMeta[dialogId] : null;
  const scopes = dialogId ? INTEGRATION_REQUIRED_SCOPES[dialogId].join(", ") : "";
  const cloud = meta?.cloud;
  return <>
    <div className="flex items-start justify-between gap-4">
      <SettingsPageHeader title={t("settings:pages.integrations")} />
      <IconTooltip label={t("common:actions.refresh")} size="icon-sm" variant="ghost" disabled={loading} onClick={() => void refreshStatuses()}>
        <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
      </IconTooltip>
    </div>
    <p className="mb-4 text-sm leading-5 text-muted-foreground">{t("settings:integrations.description")}</p>
    <SettingsList>
      {providers.map((provider) => {
        const cloud = providerMeta[provider.id]?.cloud;
        return <SettingsRow key={provider.id} icon={<IntegrationProviderIcon provider={provider.id} />} title={provider.name} description={statusDescription(provider, t)}>
          <div className="flex items-center gap-2" data-integration-id={provider.id}>
            {provider.connected ? <>
              <Button className="h-8 text-xs" variant="secondary" onClick={() => void openConnect(provider.id)}>
                {cloud ? t("settings:integrations.reconnect") : t("settings:integrations.replaceToken")}
              </Button>
              <Button className="h-8 text-xs" variant="ghost" onClick={() => setDisconnecting(provider)}>{t("settings:integrations.disconnect")}</Button>
            </> : <Button className="h-8 text-xs" variant="secondary" onClick={() => void openConnect(provider.id)}>{t("settings:integrations.connect")}</Button>}
          </div>
        </SettingsRow>;
      })}
    </SettingsList>

    <Dialog open={Boolean(dialogId)} onOpenChange={(open) => {
      if (!open && !busy) {
        if (authSession) void cancel();
        setDialogId(null);
        clearAuth();
      }
    }}>
      <DialogContent showCloseButton={!busy} className="sm:max-w-md" onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{meta?.name ?? ""}</DialogTitle>
          <DialogDescription>
            {mode === "oauth" && authSession?.kind === "device" && t("settings:integrations.deviceDescription")}
            {mode === "oauth" && authSession?.kind === "browser" && t("settings:integrations.browserDescription")}
            {mode === "pat" && t("settings:integrations.tokenHint", { scopes })}
            {mode === "oauth" && !authSession && !authError && t("settings:integrations.waiting")}
          </DialogDescription>
        </DialogHeader>

        {mode === "oauth" && authSession?.kind === "device" && <div className="space-y-3">
          <p className="rounded-lg bg-muted px-3 py-2 font-mono text-lg tracking-widest">{authSession.userCode}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void copyText(authSession.userCode)}>{t("settings:integrations.copyUserCode")}</Button>
            <Button size="sm" variant="secondary" onClick={() => void copyText(authSession.verificationUrl)}>{t("settings:integrations.copyAuthLink")}</Button>
          </div>
        </div>}

        {mode === "oauth" && authSession?.kind === "browser" && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void copyText(authSession.authorizeUrl)}>{t("settings:integrations.copyAuthLink")}</Button>
        </div>}

        {mode === "pat" && <div className="space-y-3">
          {!cloud && <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="integration-host">{t("settings:integrations.hostLabel")}</label>
            <Input id="integration-host" value={host} placeholder={t("settings:integrations.hostPlaceholder")} onChange={(event) => setHost(event.target.value)} />
          </div>}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="integration-token">
              {dialogId === "linear" ? t("settings:integrations.apiKeyLabel") : t("settings:integrations.tokenLabel")}
            </label>
            <Input id="integration-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
          </div>
          {tokenCreateUrl(dialogId!, host) && <a className="text-xs text-primary underline" href={tokenCreateUrl(dialogId!, host)} target="_blank" rel="noreferrer">
            {t("settings:integrations.tokenCreateLink")}
          </a>}
        </div>}

        {active && !active.oauthAvailable && mode === "pat" && meta?.cloud && <p className="text-xs text-muted-foreground">{t("settings:integrations.oauthUnavailable")}</p>}
        {authError && <p role="alert" className="text-xs text-destructive">{
          authError === "INTEGRATION_OAUTH_UNAVAILABLE" ? t("settings:integrations.oauthUnavailable")
            : authError === "denied" ? t("settings:integrations.denied")
              : authError === "expired" ? t("settings:integrations.expired")
                : authError === "cancelled" ? t("settings:integrations.cancelled")
                  : authError === "secretRequired" || authError === "INTEGRATION_OAUTH_SECRET_REQUIRED" ? t("settings:integrations.secretRequired")
                    : authError === "portBusy" || authError === "INTEGRATION_AUTH_PORT_BUSY" ? t("settings:integrations.portBusy")
                      : authError === "INTEGRATION_TOKEN_REJECTED" ? t("settings:integrations.checkRejected")
                        : t("settings:integrations.failed")}</p>}
        {(dialogId === "github" || dialogId === "github-enterprise") && ((mode === "oauth" && authSession?.kind === "device") || mode === "pat") && (
          <p className="text-xs text-muted-foreground">{t("settings:integrations.githubScopeHint")}</p>
        )}
        {tokenCheck === "verified" && <p role="status" className="text-xs text-muted-foreground">{t("settings:integrations.checkVerified")}</p>}
        {tokenCheck === "tls" && <p role="status" className="text-xs text-muted-foreground">{t("settings:integrations.checkTls")}</p>}
        {tokenCheck === "unreachable" && <p role="status" className="text-xs text-muted-foreground">{t("settings:integrations.checkUnreachable")}</p>}
        {tokenCheck === "rejected" && <p role="alert" className="text-xs text-destructive">{t("settings:integrations.checkRejected")}</p>}
        {copied && <p className="text-xs text-muted-foreground">{t("common:actions.copied")}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => { if (authSession) void cancel(); setDialogId(null); clearAuth(); }}>{t("common:actions.cancel")}</Button>
            {mode === "oauth" && <Button variant="secondary" disabled={busy} onClick={() => void retryOauth()}>{t("settings:integrations.retry")}</Button>}
            {mode === "pat" && <Button disabled={busy || !token.trim() || (!cloud && !host.trim())} onClick={() => void submitPat()}>{t("settings:integrations.saveConnection")}</Button>}
          </div>
          {meta?.cloud && <div className="flex w-full justify-start">
            {mode === "oauth"
              ? <Button variant="link" className="h-auto px-0 text-xs" disabled={busy} onClick={() => { if (authSession) void cancel(); setMode("pat"); clearAuth(); }}>{t("settings:integrations.useToken")}</Button>
              : active?.oauthAvailable
                ? <Button variant="link" className="h-auto px-0 text-xs" disabled={busy} onClick={() => void (setMode("oauth"), retryOauth())}>{t("settings:integrations.useOauth")}</Button>
                : null}
          </div>}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(disconnecting)} onOpenChange={(open) => { if (!open && !busy) setDisconnecting(null); }}>
      <DialogContent showCloseButton={!busy} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t("settings:integrations.disconnectTitle", { name: disconnecting?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("settings:integrations.disconnectDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setDisconnecting(null)}>{t("common:actions.cancel")}</Button>
          <Button variant="destructive" disabled={busy} onClick={() => {
            if (!disconnecting) return;
            setBusy(true);
            void disconnect(disconnecting.id).finally(() => { setBusy(false); setDisconnecting(null); });
          }}>{t("settings:integrations.disconnect")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
