import { SettingsSectionHeader } from "@/components/settings/settingsPrimitives";
import { DiffPreview } from "@/components/settings/DiffPreview";
import { DiffThemeSettings } from "@/components/settings/DiffThemeSettings";
import type { AppSettings, ResolvedTheme, ThemePreference } from "@/domain/types";
import classNames from "classnames";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

const appThemeOptions: AppThemeOption[] = [
  {
    icon: Monitor,
    preview: "system",
    title: "跟随系统",
    value: "system",
  },
  {
    icon: Sun,
    preview: "light",
    title: "浅色",
    value: "light",
  },
  {
    icon: Moon,
    preview: "dark",
    title: "深色",
    value: "dark",
  },
];

interface AppearanceThemeSettingsProps {
  /** 应用主题解析后的实际浅深色模式，用于驱动 diff 预览的 Pierre themeType。 */
  resolvedTheme: ResolvedTheme;
  /** 当前应用设置，用于判断已选中的界面主题。 */
  settings: AppSettings;
  /** 更新应用主题偏好，供全局根节点同步 light / dark class。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function AppearanceThemeSettings({ resolvedTheme, settings, updateSettings }: AppearanceThemeSettingsProps) {
  return (
    <section className="mb-10">
      <SettingsSectionHeader title="主题" description="选择 Vibe Reviewer 的界面颜色模式。" />
      <div className="grid grid-cols-3 gap-3">
        {appThemeOptions.map((option) => (
          <ThemePreferenceCard
            key={option.value}
            option={option}
            selected={settings.theme === option.value}
            onSelect={() => updateTheme(updateSettings, option.value)}
          />
        ))}
      </div>
      <div className="mt-5">
        <DiffPreview resolvedTheme={resolvedTheme} settings={settings} />
      </div>
      <div className="mt-5">
        <DiffThemeSettings settings={settings} updateSettings={updateSettings} />
      </div>
    </section>
  );
}

interface AppThemeOption {
  /** 主题卡片使用的 lucide 图标。 */
  icon: typeof Monitor;
  /** 卡片内迷你窗口预览的模式。 */
  preview: "system" | "light" | "dark";
  /** 主题卡片标题。 */
  title: string;
  /** 写入 AppSettings.theme 的实际值。 */
  value: ThemePreference;
}

interface ThemePreferenceCardProps {
  /** 当前主题选项配置。 */
  option: AppThemeOption;
  /** 当前卡片是否为已选主题。 */
  selected: boolean;
  /** 点击卡片后切换应用主题。 */
  onSelect: () => void;
}

function ThemePreferenceCard({ option, selected, onSelect }: ThemePreferenceCardProps) {
  const Icon = option.icon;

  return (
    <button
      aria-pressed={selected}
      className={classNames(
        "flex flex-col rounded-xl border bg-card p-2.5 text-left text-card-foreground transition-colors",
        "hover:bg-muted/45 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected && "border-ring bg-muted/45 ring-3 ring-ring/20",
      )}
      type="button"
      onClick={onSelect}
    >
      <ThemePreview mode={option.preview} />
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm">
            <Icon className="size-4 text-muted-foreground" />
            <span>{option.title}</span>
          </div>
        </div>
        {selected && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" />
          </span>
        )}
      </div>
    </button>
  );
}

interface ThemePreviewProps {
  /** 预览窗口的视觉模式，system 会左右展示浅深两种外观。 */
  mode: AppThemeOption["preview"];
}

function ThemePreview({ mode }: ThemePreviewProps) {
  return (
    <div className="h-[88px] overflow-hidden rounded-lg border bg-background shadow-sm">
      {mode === "system" ? (
        <div className="grid h-full grid-cols-2">
          <PreviewPane tone="light" />
          <PreviewPane tone="dark" />
        </div>
      ) : (
        <PreviewPane tone={mode} />
      )}
    </div>
  );
}

interface PreviewPaneProps {
  /** 卡片预览使用的浅色或深色外观。 */
  tone: "light" | "dark";
}

function PreviewPane({ tone }: PreviewPaneProps) {
  const isDark = tone === "dark";

  return (
    <div className={classNames("h-full p-2", isDark ? "bg-neutral-950" : "bg-white")}>
      <div className={classNames("mb-2 h-2 w-14 rounded-full", isDark ? "bg-neutral-700" : "bg-neutral-200")} />
      <div className="flex h-[calc(100%-16px)] gap-1.5">
        <div className={classNames("h-full w-6 rounded-md", isDark ? "bg-neutral-800" : "bg-neutral-100")} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className={classNames("h-3 rounded", isDark ? "bg-neutral-800" : "bg-neutral-100")} />
          <div className={classNames("h-3 rounded", isDark ? "bg-emerald-950/80" : "bg-emerald-50")} />
          <div className={classNames("h-3 rounded", isDark ? "bg-red-950/80" : "bg-red-50")} />
        </div>
      </div>
    </div>
  );
}

function updateTheme(
  updateSettings: Dispatch<SetStateAction<AppSettings>>,
  theme: ThemePreference,
) {
  updateSettings((current) => ({
    ...current,
    theme,
  }));
}
