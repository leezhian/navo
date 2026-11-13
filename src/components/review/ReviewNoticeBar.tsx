import type { ReactNode } from "react";

interface ReviewNoticeBarProps {
  /** 提示条文案或组合内容。 */
  children: ReactNode;
}

/**
 * 审查区顶部轻量提示条，与「大量差异」提示共用同一视觉样式。
 * 单行：min-h-7 + py-1 + leading-5 ≈ 28px；多行时高度随内容扩展。
 */
export function ReviewNoticeBar({ children }: ReviewNoticeBarProps) {
  return (
    <div className="flex min-h-7 shrink-0 items-center bg-amber-50 px-5 py-1 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="min-w-0 flex-1 whitespace-normal break-words">{children}</p>
    </div>
  );
}
