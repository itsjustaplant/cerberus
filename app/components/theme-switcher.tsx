import { Select } from "@cloudflare/kumo/components/select";
import { useTheme, type ThemePreference } from "./theme-provider";
const options = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
export function ThemeSwitcher({
  placement = "header",
}: {
  placement?: "header" | "sidebar";
}) {
  const { preference, setPreference } = useTheme();
  return (
    <Select
      value={preference}
      onValueChange={(value) => {
        if (value) setPreference(value as ThemePreference);
      }}
      items={options}
      aria-label="Theme"
      className="kumo-theme-switcher"
      side={placement === "sidebar" ? "top" : "bottom"}
      alignItemWithTrigger={false}
    >
      {options.map((option) => (
        <Select.Option key={option.value} value={option.value}>
          {option.label}
        </Select.Option>
      ))}
    </Select>
  );
}
