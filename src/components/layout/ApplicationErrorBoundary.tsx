import { Component } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { reportRendererError } from "@/services/rendererDiagnostics";

interface ApplicationErrorBoundaryProps {
  /** 应用根节点；异常时提供可恢复的错误页，不展示错误正文。 */
  children: ReactNode;
}

export class ApplicationErrorBoundary extends Component<ApplicationErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportRendererError("react-error", error); }
  render() { return this.state.failed ? <ApplicationErrorFallback /> : this.props.children; }
}

function ApplicationErrorFallback() {
  const { t } = useTranslation(["common"]);
  return <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-sm text-foreground">
    <p>{t("common:errors.applicationFailed")}</p>
    <Button variant="secondary" onClick={() => window.location.reload()}>{t("common:actions.reload")}</Button>
  </div>;
}
