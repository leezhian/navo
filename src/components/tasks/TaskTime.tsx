import { useTranslation } from "react-i18next";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { parseTaskDate, taskTimeLabel } from "@/utils/taskTime";

interface TaskTimeProps {
  /** 当前任务的日期字段；只改变格式，不改写日期或排序规则。 */
  value: string;
  /** 是否悬停显示完整时间；卡片关闭，列表保留。 */
  showTooltip?: boolean;
}

export function TaskTime({ value, showTooltip = true }: TaskTimeProps) {
  const { t, i18n } = useTranslation("tasks");
  const now = useMinuteClock();
  const label = taskTimeLabel(value, now);
  const date = parseTaskDate(value);
  const valid = !Number.isNaN(date.getTime());
  const fullTime = showTooltip && valid ? new Intl.DateTimeFormat(i18n.language, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date) : undefined;
  const text = label.kind === "absolute" ? label.text : t(`time.${label.unit}`, { count: label.count });
  return <time dateTime={valid ? date.toISOString() : undefined} title={fullTime}>{text}</time>;
}
