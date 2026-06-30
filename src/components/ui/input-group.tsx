import * as React from "react"
import { type VariantProps, cva } from "class-variance-authority"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const inputGroupAddonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 text-muted-foreground select-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      align: {
        "block-end": "order-last col-span-full px-2.5 pb-2",
        "block-start": "order-first col-span-full px-2.5 pt-2",
        "inline-end": "order-last pr-2.5",
        "inline-start": "order-first pl-2.5",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
)

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "group/input-group grid h-8 w-full min-w-0 grid-cols-[auto_1fr_auto] items-center rounded-lg border border-input bg-transparent shadow-sm transition-[color,box-shadow] outline-none has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:disabled]:pointer-events-none has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed has-[[data-slot=input-group-control]:disabled]:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  )
}

interface InputGroupAddonProps
  extends Omit<React.ComponentProps<"div">, "align">,
    VariantProps<typeof inputGroupAddonVariants> {
  /** 附加内容相对输入框的位置，需要与输入框 DOM 顺序配合保持焦点导航正常。 */
  align?: "inline-start" | "inline-end" | "block-start" | "block-end"
}

function InputGroupAddon({ align, className, ...props }: InputGroupAddonProps) {
  return (
    <div
      data-align={align}
      data-slot="input-group-addon"
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "order-2 col-start-2 h-full w-full min-w-0 bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  size = "xs",
  variant = "ghost",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="input-group-button"
      size={size}
      variant={variant}
      className={cn("rounded-md", className)}
      {...props}
    />
  )
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "col-span-full min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
}
