import { useEffect, useState } from "react";
import type { TraceDetail } from "../../../src/shared/extensionTypes";
import { useTranslation } from "react-i18next";
interface EventDetailProps {
  /** 选中的事件标识，用于阻止旧详情短暂显示在新事件下。 */
  selected: number | null;
  /** 已读取的详情；null 表示正在加载。 */
  detail: TraceDetail | null;
  /** 当前选中事件的正文读取是否失败。 */
  failed: boolean;
}
export function EventDetail({ selected, detail, failed }: EventDetailProps) {
  const { t } = useTranslation(["trace"]);
  const [raw, setRaw] = useState(false);
  useEffect(() => setRaw(false), [selected]);
  return (
    <>
      <div className="detail-toolbar">
        <button aria-pressed={!raw} onClick={() => setRaw(false)}>
          {t("trace:content")}
        </button>
        <button aria-pressed={raw} onClick={() => setRaw(true)}>
          {t("trace:raw")}
        </button>
        <span className="spacer" />
        {detail?.synthetic && <span>{t("trace:injected")}</span>}
      </div>
      {failed ? (
        <p role="alert">{t("trace:error")}</p>
      ) : !detail || detail.id !== selected ? (
        <p>{t("trace:loading")}</p>
      ) : (
        <>
          {detail.truncated && <p className="muted">{t("trace:clipped")}</p>}
          <pre>{raw ? detail.raw : detail.content}</pre>
          {!raw && detail.result !== undefined && (
            <>
              <p className="muted">{t("trace:result")}</p>
              <pre>{detail.result}</pre>
            </>
          )}
        </>
      )}
    </>
  );
}
