import { Input } from "@/components/ui/input";
import { SettingsList, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";
import {
  DIFF_CODE_FONT_SIZE_LIMITS,
  diffIndicatorOptions,
} from "@/domain/settings";
import type { AppSettings, DiffIndicatorMode } from "@/domain/types";
import { useEffect, useState } from "react";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import classNames from "classnames";
import { motion } from "motion/react";

const DIFF_INDICATOR_OPTION_WIDTH = 48;

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
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Input
        aria-label={ariaLabel}
        className="w-16 text-center"
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

interface DiffIndicatorControlProps {
  /** 当前差异标记方式。 */
  value: DiffIndicatorMode;
  /** 切换差异标记方式时触发。 */
  onChange: (value: DiffIndicatorMode) => void;
}

function DiffIndicatorControl({ value, onChange }: DiffIndicatorControlProps) {
  const selectedIndex = diffIndicatorOptions.findIndex((option) => option.value === value);

  return (
    <div className="relative grid h-7 w-24 grid-cols-2 rounded-full bg-muted p-0.5">
      <motion.span
        animate={{ x: Math.max(selectedIndex, 0) * DIFF_INDICATOR_OPTION_WIDTH }}
        className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-4px)] rounded-full bg-background shadow-sm"
        initial={false}
        transition={{ duration: 0.18, ease: "easeOut" }}
      />
      {diffIndicatorOptions.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={classNames(
            "relative z-10 inline-flex h-6 items-center justify-center rounded-full px-1.5 text-xs font-normal transition-colors",
            value === option.value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
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
