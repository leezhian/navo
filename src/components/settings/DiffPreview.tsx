import { getPierreDiffIndicators, getPierreTheme, getPierreUnsafeCss } from "@/components/review/diff-viewer/pierreDiffOptions";
import type { AppSettings, ResolvedTheme } from "@/domain/types";
import type { FileDiffOptions } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { useMemo } from "react";

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
  --diffs-line-height: 20px;
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
  const options = useMemo<FileDiffOptions<undefined>>(
    () => ({
      diffIndicators: getPierreDiffIndicators(settings.diffIndicatorMode),
      diffStyle: settings.diffViewMode === "split" ? "split" : "unified",
      disableFileHeader: true,
      hunkSeparators: "line-info-basic",
      lineDiffType: "word",
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
    <div className="overflow-hidden rounded-xl border bg-card">
      <PatchDiff className="block max-h-[220px] overflow-hidden" disableWorkerPool options={options} patch={PREVIEW_PATCH} />
    </div>
  );
}
