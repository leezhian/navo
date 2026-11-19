import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { IssueListFailure } from "@/shared/integrationTypes";
import { INTEGRATION_PROVIDERS } from "@/shared/integrationTypes";
import { useSettingsNavigationStore } from "@/stores/settingsNavigationStore";
import { useAppNavigation } from "@/hooks/useAppNavigation";

interface IssueFailureBannerProps {
  failures: IssueListFailure[];
  onRetry: () => void;
}

export function IssueFailureBanner({ failures, onRetry }: IssueFailureBannerProps) {
  const { t } = useTranslation(["issues", "settings"]);
  const openIntegrations = useSettingsNavigationStore((state) => state.openIntegrations);
  const selectSection = useAppNavigation().selectSection;
  if (!failures.length) return null;
  return <div className="space-y-2 px-4 pb-2" role="status">
    {failures.map((failure) => {
      const name = INTEGRATION_PROVIDERS.find((item) => item.id === failure.id)?.name ?? failure.id;
      const selfHosted = failure.id === "github-enterprise" || failure.id === "gitlab-self-hosted";
      const messageKey = failure.warning === "expired" ? "issues:banner.expired"
        : failure.warning === "unreachable" ? "issues:banner.unreachable"
          : failure.warning === "orgDenied" ? "issues:banner.orgDenied"
            : "issues:banner.unreadable";
      const action = failure.warning === "expired"
        ? <Button className="h-7 text-xs" variant="secondary" onClick={() => { openIntegrations(failure.id); selectSection("settings"); }}>
            {selfHosted ? t("issues:banner.reconnectSelfHosted") : t("issues:banner.reconnect")}
          </Button>
        : failure.warning === "unreadable"
          ? <Button className="h-7 text-xs" variant="secondary" onClick={onRetry}>{t("issues:banner.retry")}</Button>
          : <Button className="h-7 text-xs" variant="secondary" onClick={() => { openIntegrations(failure.id); selectSection("settings"); }}>{t("issues:banner.openSettings")}</Button>;
      return <div key={failure.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
        <span>{t(messageKey, { name })}</span>
        {action}
      </div>;
    })}
  </div>;
}
