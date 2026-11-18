import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Empty({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="empty" className={cn("flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl p-6 text-center text-balance", className)} {...props} />
}

function EmptyHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="empty-header" className={cn("flex max-w-sm flex-col items-center gap-2", className)} {...props} />
}

function EmptyMedia({ className, variant = "default", ...props }: ComponentProps<"div"> & {
  /** icon 为分类图标提供底色和统一尺寸；默认可直接放置插图。 */
  variant?: "default" | "icon"
}) {
  return <div data-slot="empty-icon" data-variant={variant} className={cn("mb-2 flex shrink-0 items-center justify-center", variant === "icon" && "size-8 rounded-lg bg-muted text-foreground [&_svg]:size-4", className)} {...props} />
}

function EmptyTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="empty-title" className={cn("text-sm font-medium tracking-tight", className)} {...props} />
}

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle }
