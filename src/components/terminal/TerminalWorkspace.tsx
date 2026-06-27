interface TerminalWorkspaceProps {
  /** 当前终端 tab 标题，用于占位页提示用户正在查看哪个终端页。 */
  title: string;
}

export function TerminalWorkspace({ title }: TerminalWorkspaceProps) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background pt-12">
      <div className="border-b px-5 py-2.5 text-sm text-muted-foreground">{title}</div>
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        终端页已创建，后续可在这里接入内嵌终端。
      </div>
    </section>
  );
}
