import { useTranslation } from "react-i18next";
import type { TraceEvent, TraceKind } from "@/shared/extensionTypes";
import { formatTraceDuration } from "./formatTraceDuration";
import { traceKindTone } from "./traceKind";
import { cn } from "@/lib/utils";

interface TimelineProps {
  /** 已记录时间的事件；缺少耗时时显示时间标记，不补造持续时长。 */
  events: TraceEvent[];
  /** 超过时间线数量上限时提示用户，列表仍可查看完整记录。 */
  truncated: boolean;
  /** 点击标记后定位列表中的对应事件。 */
  onSelect: (id: number) => void;
}
export function Timeline({ events, truncated, onSelect }: TimelineProps) {
  const { t } = useTranslation(["trace"]);
  const dates = events
    .flatMap((event) => (event.timestamp ? [Date.parse(event.timestamp), Date.parse(event.timestamp) + (event.durationMs ?? 0)] : []))
    .filter(Number.isFinite);
  if (!dates.length) return <p className="px-3 pb-3 text-xs text-muted-foreground">{t("trace:timelineMissing")}</p>;
  const start = Math.min(...dates),
    end = Math.max(...dates),
    total = Math.max(1, end - start);
  const lanes: Array<{ label: string; kinds: TraceKind[] }> = [
    { label: t("trace:input"), kinds: ["user", "context", "system"] },
    { label: t("trace:model"), kinds: ["assistant", "reasoning"] },
    { label: t("trace:tools"), kinds: ["tool", "error"] },
  ];
  return (
    <div className="timeline shrink-0 px-3 pb-2 text-[11px] text-muted-foreground">
      <div className="ml-11 flex justify-between tabular-nums">
        <span>0s</span>
        <span>{formatTraceDuration(total / 2)}</span>
        <span>{formatTraceDuration(total)}</span>
      </div>
      {lanes.map((lane) => (
        <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2" key={lane.label}>
          <span className="truncate">{lane.label}</span>
          <div className="relative h-6 bg-[repeating-linear-gradient(to_right,var(--border)_0,var(--border)_1px,transparent_1px,transparent_25%)]">
            {events
              .filter((event) => lane.kinds.includes(event.kind) && event.timestamp)
              .map((event) => (
                <button
                  key={event.id}
                  type="button"
                  data-kind={event.kind}
                  className={cn("absolute top-1.5 h-3 min-w-[3px] max-w-full rounded-[2px] opacity-60 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50", traceKindTone(event.kind).mark)}
                  style={{
                    left: `${Math.min(99, ((Date.parse(event.timestamp ?? "") - start) / total) * 100)}%`,
                    width: `${Math.max(0.5, ((event.durationMs ?? 0) / total) * 100)}%`,
                  }}
                  aria-label={`${t(`trace:kinds.${event.kind}`)} · ${event.tool ?? event.preview}`}
                  title={`${event.tool ?? event.preview}\n${event.timestamp}${event.durationMs === undefined ? ` · ${t("trace:missing")}` : ` · ${event.durationMs}ms`}`}
                  onClick={() => onSelect(event.id)}
                />
              ))}
          </div>
        </div>
      ))}
      {truncated && <span>{t("trace:timelineClipped")}</span>}
    </div>
  );
}
