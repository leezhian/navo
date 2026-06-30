import { diffThemePresetMap } from "@/domain/settings";
import type { AppSettings } from "@/domain/types";
import type { DiffIndicators, ThemesType } from "@pierre/diffs";
import { pierreDiffUnsafeCss } from "./pierreDiffStyles";

export function getPierreDiffIndicators(mode: AppSettings["diffIndicatorMode"]): DiffIndicators {
  return mode === "symbols" ? "classic" : "bars";
}

export function getPierreTheme(settings: AppSettings): ThemesType {
  return {
    dark: diffThemePresetMap[settings.diffDarkTheme].dark,
    light: diffThemePresetMap[settings.diffLightTheme].light,
  };
}

export function getPierreUnsafeCss(settings: AppSettings, extraCss = "") {
  return `${pierreDiffUnsafeCss}
:host {
  --diffs-font-size: ${settings.diffCodeFontSize}px;
  --diffs-header-font-size: ${settings.diffUiFontSize}px;
}

[data-diffs-header],
[data-separator] {
  font-size: var(--diffs-header-font-size);
}

${extraCss}
`;
}
