import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApplicationErrorBoundary } from "@/components/layout/ApplicationErrorBoundary";
import { bindRendererDiagnostics, reportRendererError } from "@/services/rendererDiagnostics";

bindRendererDiagnostics();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement, {
  onUncaughtError: (error) => reportRendererError("react-error", error),
}).render(
  <React.StrictMode>
    <TooltipProvider>
      <ApplicationErrorBoundary><App /></ApplicationErrorBoundary>
    </TooltipProvider>
  </React.StrictMode>,
);
