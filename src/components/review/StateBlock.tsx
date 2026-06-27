interface StateBlockProps {
  /** 可选操作按钮文案；没有操作时不展示按钮。 */
  actionLabel?: string;
  /** 状态说明正文，通常用于错误详情或空状态解释。 */
  body?: string;
  /** 状态标题，是该占位块的主要信息。 */
  title: string;
  /** 点击操作按钮时触发，需和 actionLabel 同时传入。 */
  onAction?: () => void;
}

export function StateBlock({ actionLabel, body, title, onAction }: StateBlockProps) {
  return (
    <div className="p-7 text-muted-foreground">
      <h2 className="mb-2 text-lg font-semibold text-foreground">{title}</h2>
      {body && <p className="mb-4 text-sm leading-6">{body}</p>}
      {actionLabel && onAction && (
        <button className="rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-accent" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
