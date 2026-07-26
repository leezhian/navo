import { Switch } from "@/components/ui/switch";
import type { ReactNode } from "react";

interface SettingsPageHeaderProps {
  /** 右侧设置页面主标题。 */
  title: string;
}

export function SettingsPageHeader({ title }: SettingsPageHeaderProps) {
  return <h1 className="mb-14 text-xl font-medium tracking-normal">{title}</h1>;
}

interface SettingsSectionHeaderProps {
  /** 分区标题。 */
  title: string;
  /** 分区说明，帮助用户理解当前配置影响范围。 */
  description?: string;
}

export function SettingsSectionHeader({ title, description }: SettingsSectionHeaderProps) {
  return (
    <header className="mb-5">
      <h2 className="mb-1 text-sm font-normal">{title}</h2>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </header>
  );
}

interface SettingsListProps {
  /** 设置列表中的行内容。 */
  children: ReactNode;
  /** 允许局部设置页按视觉层级调整列表容器样式。 */
  className?: string;
}

export function SettingsList({ children, className }: SettingsListProps) {
  return <div className={className ?? "overflow-hidden rounded-xl border bg-card"}>{children}</div>;
}

interface SettingsRowProps {
  /** 右侧控件，例如输入框、选择器或开关。 */
  children: ReactNode;
  /** 设置项补充说明，部分简洁配置项可以不展示。 */
  description?: string;
  /** 设置项标题。 */
  title: string;
}

export function SettingsRow({ children, description, title }: SettingsRowProps) {
  return (
    <div className="flex min-h-18 items-center justify-between gap-6 border-b px-4 last:border-b-0">
      <div className="min-w-0">
        <h3 className="text-sm font-normal">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface SettingsSwitchRowProps {
  /** 当前开关是否开启。 */
  checked: boolean;
  /** 设置项补充说明，部分简洁配置项可以不展示。 */
  description?: string;
  /** 设置项标题。 */
  title: string;
  /** 用户切换开关时触发。 */
  onCheckedChange: (checked: boolean) => void;
}

export function SettingsSwitchRow({ checked, description, title, onCheckedChange }: SettingsSwitchRowProps) {
  return (
    <SettingsRow description={description} title={title}>
      <Switch aria-label={`启用 ${title}`} checked={checked} onCheckedChange={onCheckedChange} />
    </SettingsRow>
  );
}
