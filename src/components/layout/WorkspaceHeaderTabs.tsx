import { useRef, useState } from "react";
import type { RefObject } from "react";
import { Tabs } from "radix-ui";
import { Folder, ListTodo, X } from "lucide-react";
import { MotionConfig, Reorder, useDragControls, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";

const placeholderTabs = [
  { id: "workspace", title: "任务工作区", icon: Folder },
  { id: "agent", title: "Agent 运行状态", icon: ListTodo },
  { id: "context", title: "多项目上下文", icon: ListTodo },
];

interface WorkspaceHeaderTabProps {
  /** 占位标签的数据，排序过程中保留稳定标识。 */
  tab: typeof placeholderTabs[number];
  /** 当前选中状态与拖动状态分别控制视觉样式。 */
  active: boolean;
  /** 限制标签在可见标签栏内横向拖动。 */
  listRef: RefObject<HTMLDivElement | null>;
  /** 关闭标签，由父组件处理相邻标签选择。 */
  onClose: () => void;
}

function WorkspaceHeaderTab({ tab, active, listRef, onClose }: WorkspaceHeaderTabProps) {
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();
  const [isDragging, setIsDragging] = useState(false);
  const Icon = tab.icon;

  return (
    <Reorder.Item as="div" value={tab} className="navo-workspace-tab" data-state={active ? "active" : "inactive"}
      data-dragging={isDragging} dragControls={controls} dragListener={false} dragConstraints={listRef} dragElastic={0} dragMomentum={false}
      onDragStart={() => setIsDragging(true)} onDragEnd={() => setIsDragging(false)}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}>
      <Tabs.Trigger className="navo-workspace-tab-trigger" value={tab.id} title={tab.title} draggable={false}
        onPointerDown={(event) => { if (event.button === 0 && event.isPrimary) controls.start(event); }}>
        <Icon aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{tab.title}</span>
      </Tabs.Trigger>
      <Button aria-label={"关闭标签：" + tab.title} className="navo-workspace-tab-close text-muted-foreground hover:text-foreground" size="icon-xs" type="button" variant="ghost" onClick={onClose}>
        <X aria-hidden="true" className="size-3" />
      </Button>
    </Reorder.Item>
  );
}

/** 标签支持本地选中、关闭和横向拖拽排序，不连接业务工作区生命周期。 */
export function WorkspaceHeaderTabs() {
  const listRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState(placeholderTabs);
  const [activeTab, setActiveTab] = useState(placeholderTabs[0].id);

  function closeTab(tabId: string) {
    const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0) return;
    const remainingTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(remainingTabs);
    if (activeTab === tabId) {
      setActiveTab(remainingTabs[tabIndex]?.id ?? remainingTabs[tabIndex - 1]?.id ?? "");
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <Tabs.Root className="min-w-0 flex-1" value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List aria-label="工作区标签（占位）" asChild>
          <Reorder.Group ref={listRef} as="div" axis="x" values={tabs} onReorder={setTabs} layoutScroll className="window-no-drag navo-workspace-tabs">
            {tabs.map((tab) => <WorkspaceHeaderTab key={tab.id} tab={tab} active={activeTab === tab.id} listRef={listRef} onClose={() => closeTab(tab.id)} />)}
          </Reorder.Group>
        </Tabs.List>
        {tabs.map(({ id, title }) => <Tabs.Content key={id} value={id} className="sr-only">{title}：标签结构占位，暂未接入内容切换。</Tabs.Content>)}
      </Tabs.Root>
    </MotionConfig>
  );
}
