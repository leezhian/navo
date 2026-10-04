import { useTranslation } from "react-i18next";
import { getPierreDiffIndicators, getPierreTheme, getPierreUnsafeCss } from "@/components/review/diff-viewer/pierreDiffOptions";
import { getLineDiffType } from "@/components/review/diff-code-view/diffWorkerPool";
import { Button } from "@/components/ui/button";
import type { AppSettings, ResolvedTheme } from "@/domain/types";
import { preloadHighlighter } from "@pierre/diffs";
import type { FileDiffOptions } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useState } from "react";

const PREVIEW_PATCH = `diff --git a/src/config.ts b/src/config.ts
index 4d1f9ea..7c2a93b 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,5 +1,5 @@
 const config = {
-   theme: 'light',
-   fontSize: 14,
-   lineHeight: 18
+   theme: 'dark',
+   fontSize: 16,
+   lineHeight: 20
 }`;

const PREVIEW_UNSAFE_CSS = `
:host {
  --diffs-gap-inline: 6px;
}

[data-diffs-header] {
  display: none;
}

[data-code] {
  overflow-x: hidden;
}
`;

interface DiffPreviewProps {
  /** 应用主题解析后的实际浅深色模式，用于选择当前生效的 Pierre 主题。 */
  resolvedTheme: ResolvedTheme;
  /** 当前 diff 外观设置，预览区会实时映射到 Pierre options。 */
  settings: AppSettings;
}

export function DiffPreview({ resolvedTheme, settings }: DiffPreviewProps) {
  const { t: translate } = useTranslation(["common", "settings"]);
  const { diffLightTheme, diffDarkTheme } = settings;
  const themeKey = `${diffLightTheme}/${diffDarkTheme}`;
  const [preparation, setPreparation] = useState<{ themeKey: string; status: "ready" | "error" } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const status = preparation?.themeKey === themeKey ? preparation.status : "loading";

  useEffect(() => {
    let cancelled = false;
    // 冷启动时先加载主题和语法，避免 StrictMode 重挂载复用 Pierre 尚未填充的代码节点。
    void preloadHighlighter({ themes: [diffLightTheme, diffDarkTheme], langs: ["typescript"] }).then(
      () => { if (!cancelled) setPreparation({ themeKey, status: "ready" }); },
      () => { if (!cancelled) setPreparation({ themeKey, status: "error" }); },
    );
    return () => { cancelled = true; };
  }, [diffLightTheme, diffDarkTheme, themeKey, retryAttempt]);

  const options = useMemo<FileDiffOptions<undefined>>(
    () => ({
      diffIndicators: getPierreDiffIndicators(settings.diffIndicatorMode),
      diffStyle: settings.diffViewMode === "split" ? "split" : "unified",
      disableFileHeader: true,
      hunkSeparators: "line-info-basic",
      lineDiffType: getLineDiffType(settings.enableTextDiff),
      lineHoverHighlight: "disabled",
      overflow: "wrap",
      theme: getPierreTheme(settings),
      themeType: resolvedTheme,
      tokenizeMaxLineLength: 3000,
      unsafeCSS: getPierreUnsafeCss(settings, PREVIEW_UNSAFE_CSS),
    }),
    [resolvedTheme, settings],
  );

  return (
    <div className="settings-preview">
      <div className="settings-preview-header"><span>{translate("settings:appearance.diff.preview")}</span><span>config.ts</span></div>
      {status === "ready" ? <PatchDiff key={themeKey} className="block max-h-[220px] overflow-hidden" disableWorkerPool options={options} patch={PREVIEW_PATCH} />
        : <div className="flex min-h-28 items-center justify-center gap-2 px-4 text-xs text-muted-foreground" role={status === "error" ? "alert" : "status"}>
          <span>{translate(status === "error" ? "settings:appearance.diff.previewError" : "common:status.loading")}</span>
          {status === "error" && <Button variant="ghost" size="sm" onClick={() => { setPreparation(null); setRetryAttempt((current) => current + 1); }}>{translate("common:actions.retry")}</Button>}
        </div>}
    </div>
  );
}
