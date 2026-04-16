export type ThemeId = "crt" | "gem" | "workbench";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "crt", label: "CRT Amber" },
  { id: "gem", label: "Atari ST GEM" },
  { id: "workbench", label: "Amiga Workbench" },
];

const STORAGE_KEY = "nectarine-theme";

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function loadTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (v && THEMES.some((t) => t.id === v)) return v;
  } catch {
    // ignore
  }
  return "crt";
}
