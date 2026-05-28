import type { ReactNode } from "react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface MacWindowProps {
  children: ReactNode;
  isSidebarVisible: boolean;
  onToggleSidebar: () => void;
}

export function MacWindow({ children, isSidebarVisible, onToggleSidebar }: MacWindowProps) {
  const SidebarIcon = isSidebarVisible ? PanelLeftClose : PanelLeftOpen;

  return (
    <div className="relative h-[calc(100vh-32px)] min-h-[680px] overflow-hidden rounded-2xl border bg-background shadow-2xl">
      <div className="absolute top-3 left-3.5 z-20 flex items-center gap-3">
        <div className="flex gap-2" aria-hidden="true">
          <span className="size-[11px] rounded-full bg-[#ff5f57]" />
          <span className="size-[11px] rounded-full bg-[#febc2e]" />
          <span className="size-[11px] rounded-full bg-[#28c840]" />
        </div>
        <IconTooltip label="切换边栏" onClick={onToggleSidebar}>
          <SidebarIcon className="size-5" />
        </IconTooltip>
      </div>
      {children}
    </div>
  );
}
