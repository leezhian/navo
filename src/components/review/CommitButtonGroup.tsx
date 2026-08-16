import { useState } from "react";
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
  const { status, refresh } = useGitCommitStatus(projectPath);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [directPushError, setDirectPushError] = useState<string | null>(null);

  const hasLocalChanges = status !== null && status.stagedFileCount + status.unstagedFileCount > 0;
  const canPush = status !== null && status.aheadCount > 0 && !status.isDetached;
  const showPushMode = !hasLocalChanges && canPush;
  const hasAvailableAction = hasLocalChanges || canPush;

  function openDialog() {
    setDirectPushError(null);
    setIsDialogOpen(true);
  }

  async function pushDirectly() {
    setIsPushing(true);

    try {
      await pushGitCommits(projectPath);
      setDirectPushError(null);
    } catch (error) {
      // 直接推送失败时打开弹窗展示错误，错误提示有唯一的家。
      setDirectPushError(error instanceof Error ? error.message : String(error));
      setIsDialogOpen(true);
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
            disabled={isPushing}
            label={`推送 ${status?.aheadCount ?? 0} 个未推送提交`}
            variant="outline"
            onClick={() => {
              void pushDirectly();
            }}
          >
            {isPushing ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          </IconTooltip>
        ) : (
          <IconTooltip disabled={!hasLocalChanges} label="提交更改" variant="outline" onClick={openDialog}>
            <GitCommitHorizontal className="size-4" />
          </IconTooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="更多提交操作"
              className="w-5 text-muted-foreground hover:text-foreground"
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!hasAvailableAction} onSelect={openDialog}>
              {showPushMode ? <CloudUpload className="size-4" /> : <GitCommitHorizontal className="size-4" />}
              提交或推送
            </DropdownMenuItem>
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
