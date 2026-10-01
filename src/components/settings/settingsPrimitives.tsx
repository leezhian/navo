import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsPageHeaderProps {
  /** 右侧设置页面主标题。 */
  title: string;
}

export function SettingsPageHeader({ title }: SettingsPageHeaderProps) {
  return <h1 className="mb-6 text-lg font-medium tracking-normal">{title}</h1>;
}

interface SettingsSectionHeaderProps {
  /** 分区标题。 */
  title: string;
  /** 分区说明，帮助用户理解当前配置影响范围。 */
  description?: string;
}

export function SettingsSectionHeader({ title, description }: SettingsSectionHeaderProps) {
  return (
    <header className="mb-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
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
  return <div className={cn("settings-list", className)}>{children}</div>;
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
    <div className="settings-row">
      <div className="settings-row-label">
        <h3 className="text-[13px] font-normal">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
