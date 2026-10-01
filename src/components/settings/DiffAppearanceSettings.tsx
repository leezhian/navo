import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { SettingsList, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";
import {
  DIFF_CODE_FONT_SIZE_LIMITS,
  diffIndicatorOptions,
} from "@/domain/settings";
import type { AppSettings, ResolvedTheme } from "@/domain/types";
import { useEffect, useState } from "react";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { DiffThemeSettings } from "./DiffThemeSettings";
import { DiffPreview } from "./DiffPreview";

interface DiffAppearanceSettingsProps {
  /** 当前应用设置，组件只读取和更新 diff 库相关字段。 */
  settings: AppSettings;
  /** 当前实际外观，用于实时预览浅色或深色代码主题。 */
  resolvedTheme: ResolvedTheme;
  /** 更新本地设置并触发 diff 视图重新应用 Pierre options。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function DiffAppearanceSettings({ resolvedTheme, settings, updateSettings }: DiffAppearanceSettingsProps) {
  const { t: translate } = useTranslation();
  return (
    <section>
      <SettingsSectionHeader title={translate("代码差异")} description={translate("调整代码配色、字号和差异标记，效果即时预览。")} />
      <SettingsList>
        <DiffThemeSettings settings={settings} updateSettings={updateSettings} />
        <SettingsRow title={translate("代码字体大小")} description={translate("调整差异视图中代码使用的基础字号")}>
          <NumberUnitInput
            ariaLabel={translate("代码字体大小")}
            max={DIFF_CODE_FONT_SIZE_LIMITS.max}
            min={DIFF_CODE_FONT_SIZE_LIMITS.min}
            value={settings.diffCodeFontSize}
            onChange={(value) => updateDiffSetting(updateSettings, "diffCodeFontSize", value)}
          />
        </SettingsRow>
        <SettingsRow title={translate("差异标记")} description={translate("使用颜色或 +/- 标记显示更改")}>
          <SettingsChoiceControl
            label={translate("差异标记")}
            options={diffIndicatorOptions.map((option) => ({ ...option, label: translate(option.label) }))}
            value={settings.diffIndicatorMode}
            onValueChange={(value) => updateDiffSetting(updateSettings, "diffIndicatorMode", value)}
          />
        </SettingsRow>
      </SettingsList>
      <div className="mt-4">
        <DiffPreview resolvedTheme={resolvedTheme} settings={settings} />
      </div>
    </section>
  );
}

interface NumberUnitInputProps {
  /** input 的可访问名称。 */
  ariaLabel: string;
  /** 允许输入的最大字号。 */
  max: number;
  /** 允许输入的最小字号。 */
  min: number;
  /** 当前字号数值，单位固定为 px。 */
  value: number;
  /** 字号变更后回传已经按范围约束过的数值。 */
  onChange: (value: number) => void;
}

function NumberUnitInput({ ariaLabel, max, min, value, onChange }: NumberUnitInputProps) {
  const [draftValue, setDraftValue] = useState(() => String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function commitDraftValue() {
    const nextValue = Number(draftValue);
    const normalizedValue = Number.isNaN(nextValue) ? value : clampNumber(nextValue, min, max);

    setDraftValue(String(normalizedValue));
    onChange(normalizedValue);
  }

  function handleChange(nextDraftValue: string) {
    setDraftValue(nextDraftValue);

    const nextValue = Number(nextDraftValue);
    // 键入过程中不能直接 clamp，否则输入 12 会先把 1 规整为 10，继续输入时变成 102。
    if (!Number.isNaN(nextValue) && nextValue >= min && nextValue <= max) {
      onChange(Math.round(nextValue));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Input
        aria-label={ariaLabel}
        className="h-8 w-16 rounded-lg bg-background text-center text-xs shadow-none"
        inputMode="numeric"
        max={max}
        min={min}
        type="number"
        value={draftValue}
        onBlur={commitDraftValue}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span>px</span>
    </div>
  );
}

function updateDiffSetting<Key extends keyof AppSettings>(
  updateSettings: Dispatch<SetStateAction<AppSettings>>,
  key: Key,
  value: AppSettings[Key],
) {
  updateSettings((current) => ({
    ...current,
    [key]: value,
  }));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(value), min), max);
}
