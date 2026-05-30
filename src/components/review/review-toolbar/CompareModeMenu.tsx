import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CompareMode } from "@/domain/types";
import { Check, ChevronDown } from "lucide-react";
import { compareModeLabels } from "./constants";

interface CompareModeMenuProps {
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
}

export function CompareModeMenu({ compareMode, onCompareModeChange }: CompareModeMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 gap-1 px-0 text-sm font-normal hover:bg-transparent aria-expanded:bg-transparent aria-expanded:text-foreground focus-visible:border-transparent focus-visible:ring-0"
          type="button"
          variant="ghost"
        >
          <span>{compareModeLabels[compareMode]}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {Object.entries(compareModeLabels).map(([value, label]) => (
          <DropdownMenuItem key={value} onSelect={() => onCompareModeChange(value as CompareMode)}>
            <span>{label}</span>
            {compareMode === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
