import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsList, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";
import {
  DIFF_CODE_FONT_SIZE_LIMITS,
  DIFF_UI_FONT_SIZE_LIMITS,
  diffIndicatorOptions,
} from "@/domain/settings";
import type { AppSettings, DiffIndicatorMode } from "@/domain/types";
import type { Dispatch, SetStateAction } from "react";
import classNames from "classnames";

interface DiffAppearanceSettingsProps {
  /** 当前应用设置，组件只读取和更新 diff 库相关字段。 */
  settings: AppSettings;
  /** 更新本地设置并触发 diff 视图重新应用 Pierre options。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function DiffAppearanceSettings({ settings, updateSettings }: DiffAppearanceSettingsProps) {
  return (
    <>
      <section className="mb-10">
        <SettingsSectionHeader title="差异视图" description="调整 diff 库渲染时使用的字号和标记。" />
        <SettingsList>
          <SettingsRow title="UI 字号" description="调整差异视图 UI 使用的基准字号">
            <NumberUnitInput
              ariaLabel="UI 字号"
              max={DIFF_UI_FONT_SIZE_LIMITS.max}
              min={DIFF_UI_FONT_SIZE_LIMITS.min}
              value={settings.diffUiFontSize}
              onChange={(value) => updateDiffSetting(updateSettings, "diffUiFontSize", value)}
            />
          </SettingsRow>
          <SettingsRow title="代码字体大小" description="调整差异视图中代码使用的基础字号">
            <NumberUnitInput
              ariaLabel="代码字体大小"
              max={DIFF_CODE_FONT_SIZE_LIMITS.max}
              min={DIFF_CODE_FONT_SIZE_LIMITS.min}
              value={settings.diffCodeFontSize}
              onChange={(value) => updateDiffSetting(updateSettings, "diffCodeFontSize", value)}
            />
          </SettingsRow>
          <SettingsRow title="差异标记" description="使用颜色或 +/- 标记显示更改">
            <DiffIndicatorControl
              value={settings.diffIndicatorMode}
              onChange={(value) => updateDiffSetting(updateSettings, "diffIndicatorMode", value)}
            />
          </SettingsRow>
        </SettingsList>
      </section>
    </>
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
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Input
        aria-label={ariaLabel}
        className="w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        inputMode="numeric"
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (!Number.isNaN(nextValue)) {
            onChange(clampNumber(nextValue, min, max));
          }
        }}
      />
      <span>px</span>
    </div>
  );
}

interface DiffIndicatorControlProps {
  /** 当前差异标记方式。 */
  value: DiffIndicatorMode;
  /** 切换差异标记方式时触发。 */
  onChange: (value: DiffIndicatorMode) => void;
}

function DiffIndicatorControl({ value, onChange }: DiffIndicatorControlProps) {
  return (
    <div className="inline-flex rounded-full bg-muted p-0.5">
      {diffIndicatorOptions.map((option) => (
        <Button
          className={classNames(
            "h-7 rounded-full px-3 font-normal hover:bg-transparent",
            value === option.value ? "bg-background text-foreground shadow-sm hover:bg-background" : "text-muted-foreground",
          )}
          key={option.value}
          type="button"
          variant="ghost"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
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
