import { RadioGroup } from "radix-ui";
import type { LucideIcon } from "lucide-react";

interface SettingsChoiceControlProps<Value extends string> {
  /** 单选组的无障碍名称，使用对应设置项的中文标题。 */
  label: string;
  /** 选项保持稳定的业务值，图标仅用于辅助识别主题。 */
  options: readonly { value: Value; label: string; icon?: LucideIcon }[];
  /** 当前已保存的设置值。 */
  value: Value;
  /** 选择后立即更新设置，支持键盘方向键切换。 */
  onValueChange: (value: Value) => void;
}

export function SettingsChoiceControl<Value extends string>({ label, options, value, onValueChange }: SettingsChoiceControlProps<Value>) {
  return (
    <RadioGroup.Root aria-label={label} className="settings-choice-group" value={value} onValueChange={onValueChange}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <RadioGroup.Item key={optionValue} className="settings-choice" value={optionValue}>
          {Icon && <Icon aria-hidden="true" className="size-3.5" />}
          {optionLabel}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
