import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NotificationPreferences } from "@/domain/types";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { useTaskTabsStore } from "@/stores/taskTabsStore";
import type { SessionAlert } from "@/utils/sessionAlerts";
import { planSessionAlerts, watchingTaskIds } from "@/utils/sessionAlerts";
import { formatSessionAlert } from "@/utils/sessionAlertCopy";
import { foregroundSessionIds } from "@/hooks/sessionForeground";
import { playNotificationSound } from "@/hooks/notificationSound";

export interface InAppSessionAlert extends SessionAlert {
  /** 界面列表用的稳定标识，关闭时用它定位这一条。 */
  id: string;
}

interface UseSessionNotificationsOptions {
  /** 通知页保存的通道和例外。 */
  settings: NotificationPreferences;
  /** 点击通知后打开对应任务工作台。 */
  onOpenTask: (taskId: string) => void;
  /** 任务工作台是否正在窗口里显示。设置、问题列表和任务看板都不算正在查看。 */
  workspaceVisible: boolean;
}

/** 首次加载只建立基线，避免把已经存在的回复和失败补发成通知。 */
export function useSessionNotifications({ settings, onOpenTask, workspaceVisible }: UseSessionNotificationsOptions) {
  const { t } = useTranslation(["tasks"]);
  const sessions = useTaskSessionStore((state) => state.sessions);
  const loaded = useTaskSessionStore((state) => state.loaded);
  const activeTaskId = useTaskTabsStore((state) => state.activeTaskId);
  const splits = useTaskTabsStore((state) => state.splits);
  const previous = useRef<typeof sessions | null>(null);
  const nextAlertId = useRef(0);
  const openTask = useRef(onOpenTask);
  openTask.current = onOpenTask;
  const [alerts, setAlerts] = useState<InAppSessionAlert[]>([]);

  useEffect(() => {
    if (!loaded) return;
    if (previous.current === null) { previous.current = sessions; return; }
    const planned = planSessionAlerts(previous.current, sessions, settings, {
      windowFocused: document.hasFocus() && document.visibilityState === "visible",
      foregroundSessionIds: foregroundSessionIds(),
      foregroundTaskIds: watchingTaskIds(activeTaskId, splits, workspaceVisible),
    });
    previous.current = sessions;
    const incoming: InAppSessionAlert[] = [];
    for (const alert of planned) {
      if (alert.channel === "desktop") showDesktopAlert(alert, t, openTask.current, settings.sound);
      else incoming.push({ ...alert, id: String(++nextAlertId.current) });
    }
    if (incoming.length) setAlerts((current) => [...current, ...incoming]);
  }, [activeTaskId, loaded, sessions, settings, splits, t, workspaceVisible]);

  return {
    alerts,
    dismiss(id: string) { setAlerts((current) => current.filter((alert) => alert.id !== id)); },
  };
}

function showDesktopAlert(alert: SessionAlert, t: ReturnType<typeof useTranslation<["tasks"]>>["t"], onOpenTask: (taskId: string) => void, sound: boolean) {
  if (typeof Notification === "undefined" || Notification.permission === "denied") return;
  const deliver = () => {
    const text = formatSessionAlert(alert, t("tasks:runtime.untitledSession"), (key, values) => String(t(key, values)));
    const notification = new Notification(text.title, { body: text.body });
    notification.onclick = () => { window.focus(); onOpenTask(alert.taskId); };
    if (sound) playNotificationSound();
  };
  if (Notification.permission === "granted") deliver();
  else void Notification.requestPermission().then((permission) => { if (permission === "granted") deliver(); });
}
