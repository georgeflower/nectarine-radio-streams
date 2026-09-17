export const LEGACY_THEME_STORAGE_KEY = "nectarine-theme";
export const THEME_STORAGE_KEY = "nectarine-theme-v2";

export function readThemePreference<T extends string>(
  isValid: (value: string) => value is T,
  fallback: T,
): T {
  try {
    const durable = localStorage.getItem(THEME_STORAGE_KEY);
    if (durable && isValid(durable)) return durable;

    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    const resolved = legacy && isValid(legacy) ? legacy : fallback;
    localStorage.setItem(THEME_STORAGE_KEY, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}

export function writeThemePreference(theme: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable in private or restricted browser modes.
  }
}