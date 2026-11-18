import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Button } from "@cloudflare/kumo/components/button";
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { useTheme, type ThemePreference } from "./theme-provider";

const options = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const Icon =
    options.find((option) => option.value === preference)?.icon || MonitorIcon;
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            shape="square"
            className="theme-menu-trigger"
            aria-label="Change theme"
            title="Change theme"
          >
            <Icon size={20} className="theme-menu-icon" />
          </Button>
        }
      />
      <DropdownMenu.Content
        align="end"
        sideOffset={4}
        className="theme-menu-popup"
      >
        <DropdownMenu.Group>
          <DropdownMenu.Label>Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={preference}
            onValueChange={(value) => setPreference(value as ThemePreference)}
          >
            {options.map(({ value, label, icon: OptionIcon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                icon={<OptionIcon size={16} />}
              >
                {label}
                <DropdownMenu.RadioItemIndicator className="theme-menu-check">
                  <CheckIcon size={16} />
                </DropdownMenu.RadioItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
