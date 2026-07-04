import type { AppSettings } from "@/domain/types";
import type { DiffIndicators, ThemesType } from "@pierre/diffs";
import { pierreDiffUnsafeCss } from "./pierreDiffStyles";

const DIFF_CODE_LINE_HEIGHT_EXTRA = 8;

export function getPierreDiffIndicators(mode: AppSettings["diffIndicatorMode"]): DiffIndicators {
  return mode === "symbols" ? "classic" : "bars";
}

export function getPierreTheme(settings: AppSettings): ThemesType {
  return {
    dark: settings.diffDarkTheme,
    light: settings.diffLightTheme,
  };
}

export function getDiffCodeLineHeight(fontSize: number) {
  return fontSize + DIFF_CODE_LINE_HEIGHT_EXTRA;
}

export function getPierreUnsafeCss(settings: AppSettings, extraCss = "") {
  const codeLineHeight = getDiffCodeLineHeight(settings.diffCodeFontSize);

  return `${pierreDiffUnsafeCss}
:host {
  --diffs-font-size: ${settings.diffCodeFontSize}px;
  --diffs-line-height: ${codeLineHeight}px;
  --diffs-header-font-size: ${settings.diffUiFontSize}px;
}

[data-diffs-header],
[data-separator] {
  font-size: var(--diffs-header-font-size);
}

${extraCss}
`;
}
