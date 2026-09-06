/**
 * juN3bula — 14-day rotating colour system mirroring june.style.
 * Pure module: no DOM access, no side effects.
 */

export type JunebulaColorName =
  | "GREEN"
  | "BLUE"
  | "WHITE"
  | "BROWN"
  | "YELLOW"
  | "PINK"
  | "RED"
  | "BLACK"
  | "GRAY"
  | "ORANGE"
  | "VIOLET"
  | "DARK RED";

export interface JunebulaColor {
  name: JunebulaColorName;
  main: string;
  accent: string;
}

export const JUNEBULA_COLORS: Record<JunebulaColorName, { main: string; accent: string }> = {
  GREEN: { main: "#00ff66", accent: "#66ff99" },
  BLUE: { main: "#008cff", accent: "#66c7ff" },
  WHITE: { main: "#ffffff", accent: "#d8d8d8" },
  BROWN: { main: "#8b5a2b", accent: "#c28a55" },
  YELLOW: { main: "#ffd200", accent: "#fff06a" },
  PINK: { main: "#ff69b4", accent: "#ffb6d9" },
  RED: { main: "#ff3030", accent: "#ff7777" },
  BLACK: { main: "#777777", accent: "#b0b0b0" },
  GRAY: { main: "#aaaaaa", accent: "#dddddd" },
  ORANGE: { main: "#ff8700", accent: "#ffd200" },
  VIOLET: { main: "#a855f7", accent: "#d8a8ff" },
  "DARK RED": { main: "#8b0000", accent: "#c74444" },
};

/** Monday = index 0 */
export const ODD_WEEK: JunebulaColorName[] = ["GREEN", "BLUE", "WHITE", "BROWN", "YELLOW", "PINK", "RED"];
export const EVEN_WEEK: JunebulaColorName[] = ["GREEN", "BLUE", "BLACK", "GRAY", "ORANGE", "VIOLET", "DARK RED"];

/** Direct port of the source site's ISO week calculation. */
export function getISOWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function currentJunebulaColor(date: Date = new Date()): JunebulaColor {
  const week = getISOWeek(date);
  const dayIndex = (date.getDay() + 6) % 7;
  const table = week % 2 === 1 ? ODD_WEEK : EVEN_WEEK;
  const name = table[dayIndex];
  return { name, ...JUNEBULA_COLORS[name] };
}

/** Convert `#rrggbb` to an HSL triplet string like `"145 100% 50%"`. */
export function hexToHslTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  const d = max - min;
  if (d !== 0) {
    sat = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        hue = ((g - b) / d) % 6;
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return `${round(hue)} ${round(sat * 100)}% ${round(l * 100)}%`;
}

/** Convert `#rrggbb` to `r, g, b` for rgba() shadow/glow composition. */
export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(", ");
}

/** Derived CSS custom properties for the current day's colour. */
export function junebulaCssVars(color: JunebulaColor): Record<string, string> {
  const main = hexToHslTriplet(color.main);
  const accent = hexToHslTriplet(color.accent);
  const rgb = hexToRgbTriplet(color.main);
  return {
    "--primary": main,
    "--accent": accent,
    "--ring": main,
    "--border": main,
    "--input": main,
    "--foreground": accent,
    "--card-foreground": accent,
    "--popover-foreground": accent,
    "--secondary-foreground": accent,
    "--muted-foreground": accent,
    "--glow-primary": `0 0 12px rgba(${rgb}, 0.35), 0 0 30px rgba(${rgb}, 0.15)`,
    "--glow-accent": `0 0 12px rgba(${hexToRgbTriplet(color.accent)}, 0.35)`,
  };
}

export const JUNEBULA_VAR_NAMES = Object.keys(junebulaCssVars({ name: "GREEN", ...JUNEBULA_COLORS.GREEN }));
