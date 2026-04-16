import { useEffect, useState } from "react";
import { THEMES, applyTheme, loadTheme, type ThemeId } from "@/lib/theme";

const ThemeSwitcher = () => {
  const [theme, setTheme] = useState<ThemeId>("crt");

  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => {
        const t = e.target.value as ThemeId;
        setTheme(t);
        applyTheme(t);
      }}
      className="px-3 py-2 bg-secondary text-secondary-foreground border border-border uppercase text-xs tracking-widest rounded-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
};

export default ThemeSwitcher;
