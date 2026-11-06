import type { TraceEvent } from "../../../src/shared/extensionTypes";
import { useTranslation } from "react-i18next";
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
  if (!dates.length) return <p className="timeline-empty">{t("trace:timelineMissing")}</p>;
  const start = Math.min(...dates),
    end = Math.max(...dates),
    total = Math.max(1, end - start);
  const lanes = [
    { label: t("trace:input"), kinds: ["user", "context", "system"] },
    { label: t("trace:model"), kinds: ["assistant", "reasoning"] },
    { label: t("trace:tools"), kinds: ["tool", "error"] },
  ];
  return (
    <div className="timeline">
      <div className="ticks">
        <span>0s</span>
        <span>{(total / 2000).toFixed(1)}s</span>
        <span>{(total / 1000).toFixed(1)}s</span>
      </div>
      {lanes.map((lane) => (
        <div className="lane" key={lane.label}>
          <span>{lane.label}</span>
          <div className="track">
            {events
              .filter((event) => lane.kinds.includes(event.kind) && event.timestamp)
              .map((event) => (
                <button
                  key={event.id}
                  data-kind={event.kind}
                  className="span"
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
      {truncated && <span className="muted">{t("trace:timelineClipped")}</span>}
    </div>
  );
}
