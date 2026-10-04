import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ViewSortField, ViewSortOptions } from "@/domain/viewSort";

interface WorkspaceSortControlProps {
  /** 两种布局共享的排序属性和方向。 */
  value: ViewSortOptions;
  /** 回传完整排序配置，不修改筛选和字段显隐。 */
  onChange: (value: ViewSortOptions) => void;
}

export function WorkspaceSortControl({ value, onChange }: WorkspaceSortControlProps) {
  const { t } = useTranslation();
  const ascending = value.sortDirection === "asc";
  const DirectionIcon = ascending ? ArrowUpNarrowWide : ArrowDownWideNarrow;
  const directionLabel = t(ascending ? "升序，点击切换为降序" : "降序，点击切换为升序");
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{t("排序")}</span>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label={directionLabel} className="size-8" variant="ghost" size="icon"
              onClick={() => onChange({ ...value, sortDirection: ascending ? "desc" : "asc" })}>
              <DirectionIcon aria-hidden="true" className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{directionLabel}</TooltipContent>
        </Tooltip>
        <Select value={value.sortField} onValueChange={(sortField: ViewSortField) => onChange({ ...value, sortField })}>
          <SelectTrigger aria-label={t("排序属性")} className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date">{t("日期")}</SelectItem>
            <SelectItem value="title">{t("标题")}</SelectItem>
            <SelectItem value="project">{t("项目")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
