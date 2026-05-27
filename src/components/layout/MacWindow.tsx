import type { ReactNode } from "react";

interface MacWindowProps {
  children: ReactNode;
}

export function MacWindow({ children }: MacWindowProps) {
  return (
    <div className="h-[calc(100vh-32px)] min-h-[680px] overflow-hidden rounded-2xl border bg-background shadow-2xl">
      <div className="flex h-11 items-center border-b bg-background/80 px-3.5">
        <div className="flex gap-2" aria-hidden="true">
          <span className="size-[11px] rounded-full bg-[#ff5f57]" />
          <span className="size-[11px] rounded-full bg-[#febc2e]" />
          <span className="size-[11px] rounded-full bg-[#28c840]" />
        </div>
      </div>
      {children}
    </div>
  );
}
