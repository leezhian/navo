import type { ComponentProps } from "react";
import classNames from "classnames";
import { Button } from "@/components/ui/button";

type StateBlockActionVariant = ComponentProps<typeof Button>["variant"];

interface StateBlockProps {
  /** 可选操作按钮文案；没有操作时不展示按钮。 */
  actionLabel?: string;
  /** 操作按钮额外样式，用于少数占位态覆盖 shadcn 默认字重。 */
  actionClassName?: string;
  /** 操作按钮的视觉类型，默认保持主按钮语义。 */
  actionVariant?: StateBlockActionVariant;
  /** 状态说明正文，通常用于错误详情或空状态解释。 */
  body?: string;
  /** 是否在可用区域内水平垂直居中，主要用于空 diff 占位。 */
  centered?: boolean;
  /** 是否使用和正文一致的轻量标题样式。 */
  quietTitle?: boolean;
  /** 状态标题，是该占位块的主要信息。 */
  title: string;
  /** 点击操作按钮时触发，需和 actionLabel 同时传入。 */
  onAction?: () => void;
}

export function StateBlock({
  actionLabel,
  actionClassName,
  actionVariant = "default",
  body,
  centered = false,
  quietTitle = false,
  title,
  onAction,
}: StateBlockProps) {
  return (
    <div
      className={classNames(
        "p-7 text-muted-foreground",
        centered && "flex min-h-full flex-col items-center justify-center text-center",
      )}
    >
      <h2
        className={classNames(
          "mb-2",
          quietTitle ? "text-sm font-normal text-foreground" : "text-lg font-semibold text-foreground",
        )}
      >
        {title}
      </h2>
      {body && <p className="mb-4 text-sm leading-6">{body}</p>}
      {actionLabel && onAction && (
        <Button className={actionClassName} type="button" variant={actionVariant} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
