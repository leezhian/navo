interface StateBlockProps {
  actionLabel?: string;
  body?: string;
  title: string;
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
