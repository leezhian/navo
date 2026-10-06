import { Slider } from "radix-ui";
import { useTranslation } from "react-i18next";
import { agentEffortLabel } from "@/utils/taskAgentLabels";

interface TaskAgentEffortSliderProps {
  /** 当前模型真实支持的等级，按 CLI 返回顺序形成离散档位。 */
  efforts: string[];
  /** null 保留 CLI 默认设置，不猜测实际默认等级。 */
  value: string | null;
  /** 查询或切换 Agent 期间禁止修改。 */
  disabled: boolean;
  /** 滑动或键盘操作立即回写真实等级，不保存百分比。 */
  onChange: (effort: string | null) => void;
}

export function TaskAgentEffortSlider({ efforts, value, disabled, onChange }: TaskAgentEffortSliderProps) {
  const { t } = useTranslation(["taskCreate"]);
  const levels = [null, ...efforts];
  const selectedIndex = Math.max(0, levels.indexOf(value));
  const lastIndex = levels.length - 1;
  return <div className="min-w-0 py-1" data-slot="task-agent-effort">
    <Slider.Root className="relative flex h-5 w-full touch-none items-center select-none data-disabled:opacity-50" min={0} max={lastIndex} step={1}
      disabled={disabled || lastIndex === 0} value={[selectedIndex]} onValueChange={([index]) => { if (index !== undefined && index >= 0 && index < levels.length) onChange(levels[index]); }}>
      <Slider.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted"><Slider.Range className="absolute h-full rounded-full bg-primary" /></Slider.Track>
      <Slider.Thumb aria-label={t("taskCreate:agent.effort")} aria-valuetext={agentEffortLabel(levels[selectedIndex])}
        className="block size-3.5 rounded-full border border-primary/30 bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
    </Slider.Root>
    <div className="relative mt-1 h-4 text-[10px] leading-4 text-muted-foreground" aria-hidden="true">
      {levels.map((effort, index) => <span key={effort ?? "cli-default"} className={index === selectedIndex ? "absolute font-medium text-foreground" : "absolute"}
        style={{ left: `${lastIndex ? index / lastIndex * 100 : 0}%`, transform: index === 0 ? undefined : index === lastIndex ? "translateX(-100%)" : "translateX(-50%)" }}>{agentEffortLabel(effort)}</span>)}
    </div>
  </div>;
}
