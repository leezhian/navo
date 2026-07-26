import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AGENT_TYPES } from "@/domain/sessionGroups";
import type { AgentType } from "@/domain/types";
import { ListFilter, Search } from "lucide-react";
import classNames from "classnames";

interface SessionFilterBarProps {
  /** 搜索关键字，按项目名或分支名模糊匹配。 */
  searchText: string;
  /** 更新搜索关键字。 */
  onSearchTextChange: (value: string) => void;
  /** 参与展示的 Agent 集合；全选表示未启用 Agent 筛选。 */
  enabledAgents: ReadonlySet<AgentType>;
  /** 勾选或取消某个 Agent。 */
  onToggleAgent: (agent: AgentType) => void;
}

export function SessionFilterBar({
  searchText,
  onSearchTextChange,
  enabledAgents,
  onToggleAgent,
}: SessionFilterBarProps) {
  const isAgentFilterActive = enabledAgents.size < AGENT_TYPES.length;

  return (
    <div className="flex items-center gap-1.5 px-1.5 pb-2.5">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-7 rounded-lg pl-8 focus-visible:border-input focus-visible:ring-0"
          placeholder="搜索项目或分支..."
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="按 Agent 筛选"
            className={classNames(
              isAgentFilterActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            size="icon-sm"
            type="button"
            variant={isAgentFilterActive ? "secondary" : "ghost"}
          >
            <ListFilter className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {AGENT_TYPES.map((agent) => (
            <DropdownMenuCheckboxItem
              checked={enabledAgents.has(agent)}
              key={agent}
              onCheckedChange={() => onToggleAgent(agent)}
              onSelect={(event) => event.preventDefault()}
            >
              {agent}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
