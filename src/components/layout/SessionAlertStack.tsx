import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InAppSessionAlert } from "@/hooks/useSessionNotifications";
import { formatSessionAlert } from "@/utils/sessionAlertCopy";
import { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

interface SessionAlertStackProps {
  /** 使用应用时出现的会话提醒，直到单独关闭。 */
  alerts: InAppSessionAlert[];
  /** 关闭一条，不改变会话未读状态。 */
  onDismiss: (id: string) => void;
  /** 打开提醒对应的任务。 */
  onOpen: (taskId: string) => void;
}

/** 应用内提醒用 Toast 贴在窗口右上角。不自动消失，避免还没打开任务就没了。 */
export function SessionAlertStack({ alerts, onDismiss, onOpen }: SessionAlertStackProps) {
  const { t } = useTranslation(["tasks", "common", "settings"]);
  if (!alerts.length) return null;
  return (
    <ToastProvider duration={Infinity} swipeDirection="right" label={t("settings:pages.notifications")}>
      <ToastViewport className="top-14 right-4 max-h-[calc(100vh-4.5rem)] w-80 max-w-[calc(100%-2rem)]" />
      {alerts.map((alert) => (
        <SessionAlertToast key={alert.id} alert={alert} onDismiss={onDismiss} onOpen={onOpen} />
      ))}
    </ToastProvider>
  );
}

interface SessionAlertToastProps {
  /** 这一条应用内提醒。 */
  alert: InAppSessionAlert;
  /** 退出动画结束后再从列表移除，不改变未读。 */
  onDismiss: (id: string) => void;
  /** 点击卡片时打开对应任务。 */
  onOpen: (taskId: string) => void;
}

function SessionAlertToast({ alert, onDismiss, onOpen }: SessionAlertToastProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(true);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const text = formatSessionAlert(alert, t("tasks:runtime.untitledSession"), (key, values) => String(t(key, values)));
  // 关闭后先留在树上，等退出动画结束再卸掉。没有动画时用超时兜底。
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => dismiss.current(alert.id), 200);
    return () => window.clearTimeout(timer);
  }, [alert.id, open]);
  return (
    <Toast open={open} duration={Infinity} onOpenChange={setOpen} onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && !open) dismiss.current(alert.id);
    }}>
      <div className="min-w-0 flex-1">
        <ToastTitle>{text.title}</ToastTitle>
        <ToastDescription className="mt-1">{text.body}</ToastDescription>
      </div>
      <ToastClose aria-label={t("common:actions.close")} />
      <ToastAction
        altText={t("common:actions.open")}
        aria-label={t("common:actions.open")}
        className="absolute inset-0 z-0 rounded-xl"
        onClick={() => onOpen(alert.taskId)}
      />
    </Toast>
  );
}
