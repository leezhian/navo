import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TraceDetail } from "@/shared/extensionTypes";
import { Button } from "@/components/ui/button";
import { TraceError } from "./TraceError";
import type { TraceErrorCode } from "./TraceError";

interface EventDetailProps {
  /** 选中的事件标识，用于阻止旧详情短暂显示在新事件下。 */
  selected: number | null;
  /** 已读取的详情；null 表示正在加载。 */
  detail: TraceDetail | null;
  /** 当前选中事件的正文读取失败原因；null 表示未失败。 */
  failed: TraceErrorCode | null;
}
const pre = "my-2 rounded-md bg-background p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]";

/** 轨迹正文按纯文本展示，不执行其中的 Markdown、链接或命令。 */
export function EventDetail({ selected, detail, failed }: EventDetailProps) {
  const { t } = useTranslation(["trace"]);
  const [raw, setRaw] = useState(false);
  useEffect(() => setRaw(false), [selected]);
  const tab = (active: boolean): "secondary" | "ghost" => (active ? "secondary" : "ghost");
  return (
    <>
      <div className="detail-toolbar flex items-center gap-1 text-[11px] text-muted-foreground">
        <Button size="xs" variant={tab(!raw)} aria-pressed={!raw} className="font-normal" onClick={() => setRaw(false)}>
          {t("trace:content")}
        </Button>
        <Button size="xs" variant={tab(raw)} aria-pressed={raw} className="font-normal" onClick={() => setRaw(true)}>
          {t("trace:raw")}
        </Button>
        <span className="flex-1" />
        {detail?.synthetic && <span>{t("trace:injected")}</span>}
        {detail?.bookkeeping && <span>{t("trace:bookkeeping")}</span>}
      </div>
      {failed ? (
        <div role="alert" className="py-2"><TraceError code={failed} /></div>
      ) : !detail || detail.id !== selected ? (
        <p className="py-2 text-xs text-muted-foreground">{t("trace:loading")}</p>
      ) : (
        <>
          {detail.truncated && <p className="mt-2 text-[11px] text-muted-foreground">{t("trace:clipped")}</p>}
          <pre className={pre}>{raw ? detail.raw : detail.content}</pre>
          {!raw && detail.result !== undefined && (
            <>
              <p className="text-[11px] text-muted-foreground">{t("trace:result")}</p>
              <pre className={pre}>{detail.result}</pre>
            </>
          )}
        </>
      )}
    </>
  );
}
