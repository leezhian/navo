import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AppSettings, ResolvedTheme, ReviewSession } from "@/domain/types";
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
}

export function ReviewDialog({ session, open, onOpenChange, ...preferences }: ReviewDialogProps) {
  const { t: translate } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[92vw] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-none">
        <DialogTitle className="sr-only">{translate("代码差异审查")}</DialogTitle>
        <DialogDescription className="sr-only">{translate("查看未暂存、已暂存或分支差异，保留文件导航、评论及 Git 操作。")}</DialogDescription>
        {open && session && <ReviewDialogContent session={session} {...preferences} />}
      </DialogContent>
    </Dialog>
  );
}

type ReviewDialogContentProps = Pick<ReviewDialogProps, "settings" | "resolvedTheme" | "onSettingsChange"> & {
  /** 已确认存在的审查项目上下文。 */
  session: ReviewSession;
};

function ReviewDialogContent({ session, settings, resolvedTheme, onSettingsChange }: ReviewDialogContentProps) {
  const review = useReviewData({ selectedSession: session, targetBranch: settings.targetBranch });
  return (
    <div className="min-h-0 flex-1 pt-10">
      <ReviewWorkspace session={session} settings={settings} resolvedTheme={resolvedTheme}
        collapsedFileIds={review.collapsedFileIds} compareMode={review.compareMode} compareModeFileCounts={review.compareModeFileCounts}
        localBranches={review.localBranches} reviewError={review.reviewError} summary={review.reviewSummary}
        selectedFileId={review.selectedFileId} scrollCacheKey={review.scrollCacheKey} untrackedFileCount={review.untrackedFileCount}
        onCompareModeChange={review.setCompareMode} onBatchFileAction={review.runBatchFileAction} onFileAction={review.runFileAction}
        onRefresh={review.refreshReview} onSelectedFileChange={review.setSelectedFileId} onSettingsChange={onSettingsChange}
        onToggleAllCollapsed={review.toggleAllCollapsed} onToggleFile={review.toggleFileCollapsed} />
    </div>
  );
}
