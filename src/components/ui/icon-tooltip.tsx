import type { ComponentProps, ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

interface IconTooltipProps
  extends ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** tooltip 和 aria-label 共用文案，必须能准确说明按钮动作。 */
  label: string;
  /** 按钮内图标或少量可视内容。 */
  children: ReactNode;
}

export function IconTooltip({
  label,
  children,
  className,
  size = "icon-sm",
  variant = "ghost",
  ...props
}: IconTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={cn("text-muted-foreground hover:text-foreground", className)}
          size={size}
          type="button"
          variant={variant}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
