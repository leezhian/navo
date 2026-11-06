import { useTranslation } from "react-i18next";
import { useState } from "react";
import { X } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { Dispatch, SetStateAction } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AppSettings, CompareMode, ResolvedTheme, ReviewSession } from "@/domain/types";
import { useReviewData } from "@/hooks/useReviewData";
import { ReviewWorkspace } from "./ReviewWorkspace";

interface ReviewDialogProps {
  /** 后续任务或项目入口提供的审查上下文，不依赖旧会话列表。 */
  session: ReviewSession | null;
  /** 是否打开 diff 弹窗；关闭时不加载项目 diff。 */
  open: boolean;
  /** 响应关闭按钮、Escape 及其他弹窗状态变化。 */
  onOpenChange: (open: boolean) => void;
  /** 与应用设置共用的 diff 阅读偏好。 */
  settings: AppSettings;
  /** 应用实际主题，控制 diff 深浅色。 */
  resolvedTheme: ResolvedTheme;
  /** 从 diff 工具栏修改阅读偏好时同步应用设置。 */
  onSettingsChange: Dispatch<SetStateAction<AppSettings>>;
  /** 分支栏入口的初始范围、基准与文件；不影响原有入口的阅读偏好。 */
  initialCompareMode?: CompareMode;
  initialTargetBranch?: string;
  initialFilePath?: string;
}

export function ReviewDialog({ session, open, onOpenChange, ...preferences }: ReviewDialogProps) {
  const { t: translate } = useTranslation(["common", "review"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-none flex-col gap-0 overflow-hidden rounded-[14px] p-0 sm:h-[calc(100dvh-48px)] sm:w-[calc(100vw-48px)] sm:max-w-none">
        <DialogTitle className="sr-only">{translate("review:dialog.title")}</DialogTitle>
        <DialogDescription className="sr-only">{translate("review:dialog.description")}</DialogDescription>
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-3 text-xs"><span className="truncate">{session?.projectName} · {session?.branchName}</span><IconTooltip label={translate("common:actions.close")} size="icon-xs" onClick={() => onOpenChange(false)}><X /></IconTooltip></div>
        {open && session && <ReviewDialogContent key={`${session.id}:${preferences.initialCompareMode}:${preferences.initialFilePath}`} session={session} {...preferences} />}
      </DialogContent>
    </Dialog>
  );
}

type ReviewDialogContentProps = Pick<ReviewDialogProps, "settings" | "resolvedTheme" | "onSettingsChange" | "initialCompareMode" | "initialTargetBranch" | "initialFilePath"> & {
  /** 已确认存在的审查项目上下文。 */
  session: ReviewSession;
};

function ReviewDialogContent({ session, settings, resolvedTheme, onSettingsChange, initialCompareMode, initialTargetBranch, initialFilePath }: ReviewDialogContentProps) {
  const [targetBranch, setTargetBranch] = useState(initialTargetBranch ?? settings.targetBranch);
  const viewSettings = { ...settings, targetBranch };
  const review = useReviewData({ selectedSession: session, targetBranch, initialCompareMode });
  function updatePreferences(update: SetStateAction<AppSettings>) {
    const next = typeof update === "function" ? update(viewSettings) : update;
    setTargetBranch(next.targetBranch);
    onSettingsChange((current) => ({ ...next, targetBranch: initialTargetBranch === undefined ? next.targetBranch : current.targetBranch }));
  }
  return (
    <div className="min-h-0 flex-1">
      <ReviewWorkspace session={session} settings={viewSettings} resolvedTheme={resolvedTheme} initialFilePath={initialFilePath}
        collapsedFileIds={review.collapsedFileIds} compareMode={review.compareMode} compareModeFileCounts={review.compareModeFileCounts}
        branches={review.branches} reviewError={review.reviewError} summary={review.reviewSummary}
        selectedFileId={review.selectedFileId} scrollCacheKey={review.scrollCacheKey} untrackedFileCount={review.untrackedFileCount}
        onCompareModeChange={review.setCompareMode} onBatchFileAction={review.runBatchFileAction} onFileAction={review.runFileAction}
        onRefresh={review.refreshReview} onSelectedFileChange={review.setSelectedFileId} onSettingsChange={updatePreferences}
        onToggleAllCollapsed={review.toggleAllCollapsed} onToggleFile={review.toggleFileCollapsed} />
    </div>
  );
}
