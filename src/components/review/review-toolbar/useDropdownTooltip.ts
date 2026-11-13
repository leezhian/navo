import { useRef, useState } from "react";

export function useDropdownTooltip() {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const suppressUntilRef = useRef(0);

  const suppressTooltip = () => {
    suppressUntilRef.current = Date.now() + 400;
    setIsTooltipOpen(false);
  };

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    suppressTooltip();
  };

  const handleTooltipOpenChange = (open: boolean) => {
    // Radix 会在菜单关闭后把焦点还给触发按钮，这里避免 tooltip 被焦点自动打开并停留。
    if (open && (isMenuOpen || Date.now() < suppressUntilRef.current)) {
      return;
    }

    setIsTooltipOpen(open);
  };

  return {
    handleMenuOpenChange,
    handleTooltipOpenChange,
    isTooltipOpen,
  };
}
