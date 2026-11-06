import { useEffect, useState } from "react";
import type { TraceDetail } from "../../../src/shared/extensionTypes";
import type { Labels } from "./labels";
interface EventDetailProps {
  /** 选中的事件标识，用于阻止旧详情短暂显示在新事件下。 */
  selected: number | null;
  detail: TraceDetail | null;
  failed: boolean;
  labels: Labels;
}
export function EventDetail({ selected, detail, failed, labels: l }: EventDetailProps) {
  const [raw, setRaw] = useState(false);
  useEffect(() => setRaw(false), [selected]);
  return (
    <>
      <div className="detail-toolbar">
        <button aria-pressed={!raw} onClick={() => setRaw(false)}>
          {l.content}
        </button>
        <button aria-pressed={raw} onClick={() => setRaw(true)}>
          {l.raw}
        </button>
        <span className="spacer" />
        {detail?.synthetic && <span>{l.injected}</span>}
      </div>
      {failed ? (
        <p role="alert">{l.error}</p>
      ) : !detail || detail.id !== selected ? (
        <p>{l.loading}</p>
      ) : (
        <>
          {detail.truncated && <p className="muted">{l.clipped}</p>}
          <pre>{raw ? detail.raw : detail.content}</pre>
          {!raw && detail.result !== undefined && (
            <>
              <p className="muted">{l.result}</p>
              <pre>{detail.result}</pre>
            </>
          )}
        </>
      )}
    </>
  );
}
