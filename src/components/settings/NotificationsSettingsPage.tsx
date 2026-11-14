import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, NotificationChannel, NotificationPreferences } from "@/domain/types";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsList, SettingsPageHeader, SettingsSectionHeader } from "./settingsPrimitives";

interface NotificationsSettingsPageProps {
  /** 当前偏好，通知设置与其他设置一起保存。 */
  settings: AppSettings;
  /** 更新整份设置，由主进程持久化。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

const topics = ["replies", "questions", "permissions", "approvals", "errors"] as const satisfies ReadonlyArray<keyof NotificationPreferences>;
const topicTitle = {
  replies: "settings:notifications.topic.replies",
  questions: "settings:notifications.topic.questions",
  permissions: "settings:notifications.topic.permissions",
  approvals: "settings:notifications.topic.approvals",
  errors: "settings:notifications.topic.errors",
} as const;
const topicDescription = {
  replies: "settings:notifications.topic.repliesDescription",
  questions: "settings:notifications.topic.questionsDescription",
  permissions: "settings:notifications.topic.permissionsDescription",
  approvals: "settings:notifications.topic.approvalsDescription",
  errors: "settings:notifications.topic.errorsDescription",
} as const;

/** 通知单独成页：每类提醒分桌面和应用内，底部是提示音和当前任务例外。 */
export function NotificationsSettingsPage({ settings, updateSettings }: NotificationsSettingsPageProps) {
  const { t } = useTranslation(["settings"]);
  const notifications = settings.notifications;
  const update = (next: NotificationPreferences) => updateSettings((current) => ({ ...current, notifications: next }));
  const setChannel = (topic: typeof topics[number], channel: keyof NotificationChannel, checked: boolean) => {
    update({ ...notifications, [topic]: { ...notifications[topic], [channel]: checked } });
  };

  return <>
    <SettingsPageHeader title={t("settings:pages.notifications")} />
    <section>
      <SettingsSectionHeader title={t("settings:notifications.topics")} description={t("settings:notifications.description")} />
      <SettingsList>
        <div className="flex justify-end gap-3 border-b border-border py-3 text-xs text-muted-foreground">
          <span className="w-14 text-center">{t("settings:notifications.desktop")}</span>
          <span className="w-14 text-center">{t("settings:notifications.inApp")}</span>
        </div>
        {topics.map((topic) => <div key={topic} className="settings-row">
          <div className="settings-row-label">
            <h3 className="text-[13px] font-normal">{t(topicTitle[topic])}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(topicDescription[topic])}</p>
          </div>
          <div className="settings-row-control">
            <span className="flex w-14 justify-center"><Checkbox aria-label={t("settings:notifications.channelLabel", { topic: t(topicTitle[topic]), channel: t("settings:notifications.desktop") })} checked={notifications[topic].desktop} onCheckedChange={(checked) => setChannel(topic, "desktop", checked === true)} /></span>
            <span className="flex w-14 justify-center"><Checkbox aria-label={t("settings:notifications.channelLabel", { topic: t(topicTitle[topic]), channel: t("settings:notifications.inApp") })} checked={notifications[topic].inApp} onCheckedChange={(checked) => setChannel(topic, "inApp", checked === true)} /></span>
          </div>
        </div>)}
        <label className="settings-row items-start">
          <span className="flex items-start gap-3"><Checkbox className="mt-0.5" checked={notifications.sound} aria-label={t("settings:notifications.sound")} onCheckedChange={(checked) => update({ ...notifications, sound: checked === true })} /><span className="text-[13px]">{t("settings:notifications.sound")}</span></span>
        </label>
        <label className="settings-row items-start">
          <span className="flex items-start gap-3">
            <Checkbox className="mt-0.5" checked={notifications.includeForeground} aria-label={t("settings:notifications.includeForeground")} onCheckedChange={(checked) => update({ ...notifications, includeForeground: checked === true })} />
            <span><span className="block text-[13px]">{t("settings:notifications.includeForeground")}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("settings:notifications.includeForegroundDescription")}</span></span>
          </span>
        </label>
      </SettingsList>
    </section>
  </>;
}
