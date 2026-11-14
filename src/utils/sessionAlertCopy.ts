import type { SessionAlert } from "@/utils/sessionAlerts";

type NotifyTitleKey = "tasks:runtime.notify.replyTitle" | "tasks:runtime.notify.permissionTitle" | "tasks:runtime.notify.failureTitle";
type NotifyBodyKey = "tasks:runtime.notify.replyBody" | "tasks:runtime.notify.permissionBody" | "tasks:runtime.notify.permissionFallback" | "tasks:runtime.notify.failureBody";

export interface SessionAlertCopy {
  titleKey: NotifyTitleKey;
  bodyKey: NotifyBodyKey;
  /** 权限请求把工具名放进状态句，不放命令参数。 */
  bodyValues?: { reason: string };
}

type TranslateAlert = (key: NotifyTitleKey | NotifyBodyKey, values?: { name?: string; reason?: string }) => string;

/** 标题放会话名称，正文只放状态。桌面通知和应用内提醒共用这一份。 */
export function formatSessionAlert(alert: Pick<SessionAlert, "kind" | "reason" | "name">, untitled: string, translate: TranslateAlert) {
  const name = alert.name || untitled;
  const copy = sessionAlertCopy(alert);
  return {
    title: translate(copy.titleKey, { name }),
    body: copy.bodyValues ? translate(copy.bodyKey, copy.bodyValues) : translate(copy.bodyKey),
  };
}

function sessionAlertCopy(alert: Pick<SessionAlert, "kind" | "reason">): SessionAlertCopy {
  switch (alert.kind) {
    case "reply":
      return { titleKey: "tasks:runtime.notify.replyTitle", bodyKey: "tasks:runtime.notify.replyBody" };
    case "permission":
      return alert.reason
        ? { titleKey: "tasks:runtime.notify.permissionTitle", bodyKey: "tasks:runtime.notify.permissionBody", bodyValues: { reason: alert.reason } }
        : { titleKey: "tasks:runtime.notify.permissionTitle", bodyKey: "tasks:runtime.notify.permissionFallback" };
    case "failure":
      return { titleKey: "tasks:runtime.notify.failureTitle", bodyKey: "tasks:runtime.notify.failureBody" };
  }
}
