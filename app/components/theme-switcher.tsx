import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "./theme-provider";
const options = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const Icon =
    preference === "system" ? Monitor : preference === "light" ? Sun : Moon;
  return (
    <Select.Root
      value={preference}
      onValueChange={(value) => {
        if (value) setPreference(value as ThemePreference);
      }}
      items={options}
    >
      <Select.Trigger className="theme-trigger" aria-label="Theme">
        <Icon size={16} />
        <Select.Value className="theme-value" />
        <Select.Icon>
          <ChevronDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={6}
          align="end"
          alignItemWithTrigger={false}
          className="select-positioner"
        >
          <Select.Popup className="select-popup theme-options">
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="select-item"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={15} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
