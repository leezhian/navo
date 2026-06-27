import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CompareMode, CompareModeFileCounts } from "@/domain/types";
import { Check, ChevronDown } from "lucide-react";
import { compareModeLabels } from "./constants";

interface CompareModeMenuProps {
  /** 当前生效的对比方式。 */
  compareMode: CompareMode;
  /** 对比方式文件数角标，目前只展示未暂存和已暂存的非零数量。 */
  fileCounts?: CompareModeFileCounts;
  /** 用户选择对比方式后通知上层重新加载 diff。 */
  onCompareModeChange: (mode: CompareMode) => void;
}

export function CompareModeMenu({ compareMode, fileCounts, onCompareModeChange }: CompareModeMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 gap-1 px-0 text-sm font-normal hover:bg-transparent aria-expanded:bg-transparent aria-expanded:text-foreground focus-visible:border-transparent focus-visible:ring-0"
          type="button"
          variant="ghost"
        >
          <span>{compareModeLabels[compareMode]}</span>
          <CompareModeFileCountBadge count={getVisibleFileCount(compareMode, fileCounts)} />
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {Object.entries(compareModeLabels).map(([value, label]) => (
          <DropdownMenuItem
            className="gap-2"
            key={value}
            onSelect={() => onCompareModeChange(value as CompareMode)}
          >
            <span>{label}</span>
            <span className="ml-auto inline-flex items-center gap-2">
              <CompareModeFileCountBadge count={getVisibleFileCount(value as CompareMode, fileCounts)} />
              {compareMode === value && <Check className="size-4" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CompareModeFileCountBadgeProps {
  /** 需要展示的文件数量，空值或 0 不展示角标。 */
  count?: number;
}

function CompareModeFileCountBadge({ count }: CompareModeFileCountBadgeProps) {
  if (!count || count <= 0) {
    return null;
  }

  return (
    <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-md bg-muted px-1.5 text-xs leading-none text-muted-foreground">
      {count}
    </span>
  );
}

function getVisibleFileCount(mode: CompareMode, fileCounts?: CompareModeFileCounts) {
  if (mode !== "unstaged" && mode !== "staged") {
    return undefined;
  }

  return fileCounts?.[mode];
}
