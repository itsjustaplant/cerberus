import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
const key = "cerberus-theme";
function valid(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export const themeInit = `(()=>{try{const p=localStorage.getItem('${key}');const t=p==='light'||p==='dark'?p:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()`;
const ThemeContext = createContext({
  preference: "system" as ThemePreference,
  resolved: "system" as ThemePreference,
  setPreference: (_value: ThemePreference) => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setValue] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ThemePreference>("system");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    let current: ThemePreference = "system";
    try {
      current = valid(localStorage.getItem(key));
    } catch {
      /* Private storage may be unavailable. */
    }
    function apply(value: ThemePreference) {
      const theme =
        value === "system" ? (media.matches ? "dark" : "light") : value;
      current = value;
      setValue(value);
      setResolved(theme);
      document.documentElement.dataset.theme = theme;
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach((meta) => {
          meta.content = theme === "dark" ? "#0d0d10" : "#faf9f7";
        });
    }
    const update = () => apply(current);
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) apply(valid(event.newValue));
    };
    const selected = (event: Event) =>
      apply((event as CustomEvent<ThemePreference>).detail);
    apply(current);
    media.addEventListener("change", update);
    window.addEventListener("storage", storage);
    window.addEventListener("cerberus-theme-change", selected);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", storage);
      window.removeEventListener("cerberus-theme-change", selected);
    };
  }, []);
  function setPreference(value: ThemePreference) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Keep this session's preference. */
    }
    window.dispatchEvent(
      new CustomEvent("cerberus-theme-change", { detail: value }),
    );
  }
  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  return useContext(ThemeContext);
}
