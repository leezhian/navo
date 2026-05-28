import type { ReactNode } from "react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import classNames from "classnames";

interface MacWindowProps {
  children: ReactNode;
  isSidebarVisible: boolean;
  showWindowControls?: boolean;
  onToggleSidebar: () => void;
}

export function MacWindow({
  children,
  isSidebarVisible,
  showWindowControls = true,
  onToggleSidebar,
}: MacWindowProps) {
  return (
    <div className="relative h-[calc(100vh-32px)] min-h-[680px] overflow-hidden rounded-2xl border bg-background shadow-2xl">
      {showWindowControls && (
        <WindowControls
          className="absolute top-2 left-3.5 z-20"
          isSidebarVisible={isSidebarVisible}
          onToggleSidebar={onToggleSidebar}
        />
      )}
      {children}
    </div>
  );
}

interface WindowControlsProps {
  className?: string;
  isSidebarVisible: boolean;
  onToggleSidebar: () => void;
}

export function WindowControls({ className, isSidebarVisible, onToggleSidebar }: WindowControlsProps) {
  const SidebarIcon = isSidebarVisible ? PanelLeftClose : PanelLeftOpen;

  return (
    <div className={classNames("flex items-center gap-3", className)}>
      <div className="flex gap-2" aria-hidden="true">
        <span className="size-[11px] rounded-full bg-[#ff5f57]" />
        <span className="size-[11px] rounded-full bg-[#febc2e]" />
        <span className="size-[11px] rounded-full bg-[#28c840]" />
      </div>
      <IconTooltip label="切换边栏" onClick={onToggleSidebar}>
        <SidebarIcon className="size-5" />
      </IconTooltip>
    </div>
  );
}
