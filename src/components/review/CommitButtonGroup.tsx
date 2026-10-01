import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { ChevronDown, CloudUpload, GitCommitHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog } from "@/components/ui/dialog";
import { getCommitStatusCapabilities } from "@/domain/commitStatus";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useGitCommitStatus } from "@/hooks/useGitCommitStatus";
import { pushGitCommits } from "@/services/reviewApi";
import { CommitDialog } from "./CommitDialog";

interface CommitButtonGroupProps {
  /** 当前审查会话的项目根路径，提交/推送均作用于该仓库。 */
  projectPath: string;
}

/**
 * 顶栏提交/推送按钮组。左段三态：有本地改动为提交入口（弹窗）；
 * 无改动但有未推送提交时变为直接推送；两者皆无则置灰。
 */
export function CommitButtonGroup({ projectPath }: CommitButtonGroupProps) {
  const { t: translate } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOpeningDialog, setIsOpeningDialog] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [directPushError, setDirectPushError] = useState<string | null>(null);
  const {
    status,
    refresh,
    refreshWithDiffStats,
    error: statusError,
  } = useGitCommitStatus(projectPath, {
    includeDiffStats: isDialogOpen || isOpeningDialog,
  });

  const { hasLocalChanges, canPush, hasAvailableAction } = getCommitStatusCapabilities(status);
  const showPushMode = !hasLocalChanges && canPush;

  useEffect(() => {
    if (statusError) {
      setIsDialogOpen(false);
    }
  }, [statusError]);

  async function openDialog(dialogError: string | null = null) {
    if (isOpeningDialog || statusError) {
      return;
    }

    setDirectPushError(dialogError);
    setIsOpeningDialog(true);

    try {
      // 点击入口时再读一次真实 Git 状态，避免弹窗沿用按钮渲染时的旧快照。
      const latestStatus = await refreshWithDiffStats();

      if (latestStatus && getCommitStatusCapabilities(latestStatus).hasAvailableAction) {
        setIsDialogOpen(true);
      }
    } finally {
      setIsOpeningDialog(false);
    }
  }

  async function pushDirectly() {
    if (!canPush || isPushing) {
      return;
    }

    setIsPushing(true);

    try {
      await pushGitCommits(projectPath);
      setDirectPushError(null);
    } catch (error) {
      // 直接推送失败时打开弹窗展示错误，错误提示有唯一的家。
      await openDialog(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPushing(false);
      refresh();
    }
  }

  return (
    <>
      <ButtonGroup>
        {showPushMode ? (
          <IconTooltip
            disabled={isPushing || isOpeningDialog || statusError !== null}
            label={statusError ? translate("无法读取 Git 状态") : translate("推送 {{count}} 个未推送提交", { count: status?.aheadCount ?? 0 })}
            variant="outline"
            onClick={() => {
              void pushDirectly();
            }}
          >
            {isPushing ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          </IconTooltip>
        ) : (
          <IconTooltip
            disabled={!hasLocalChanges || isOpeningDialog || statusError !== null}
            label={statusError ? translate("无法读取 Git 状态") : translate("提交更改")}
            variant="outline"
            onClick={() => {
              void openDialog();
            }}
          >
            {isOpeningDialog ? <Loader2 className="size-4 animate-spin" /> : <GitCommitHorizontal className="size-4" />}
          </IconTooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={translate("更多提交操作")}
              className="w-5 text-muted-foreground hover:text-foreground"
              disabled={!hasAvailableAction || isPushing || isOpeningDialog || statusError !== null}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!hasAvailableAction || isOpeningDialog}
              onSelect={() => {
                void openDialog();
              }}
            >
              {showPushMode ? <CloudUpload className="size-4" /> : <GitCommitHorizontal className="size-4" />}
              {translate("提交或推送")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setDirectPushError(null);
          }
        }}
      >
        {isDialogOpen && status && (
          <CommitDialog
            externalError={directPushError}
            projectPath={projectPath}
            status={status}
            onClose={() => setIsDialogOpen(false)}
            onStatusChanged={refresh}
          />
        )}
      </Dialog>
    </>
  );
}
