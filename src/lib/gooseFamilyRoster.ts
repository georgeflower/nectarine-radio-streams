// Roster of goose family members — originals + every gosling + every
// grown-up family adult. Persists across reloads via localStorage.

export type GooseColor =
  | "white"
  | "brown"
  | "pink"
  | "yellow"
  | "lightgreen"
  | "amigablue"
  | "black";

export const ADULT_COLORS: GooseColor[] = [
  "pink",
  "yellow",
  "lightgreen",
  "amigablue",
  "brown",
  "white",
  "black",
];

export const COLOR_HEX: Record<GooseColor, string> = {
  white: "#f2f2f2",
  brown: "#8a5a32",
  pink: "#ff8ec0",
  yellow: "#ffe05a",
  lightgreen: "#a8e57c",
  amigablue: "#5cc8ff",
  black: "#1a1a1a",
};

// CSS filter that recolors the base white sprite toward the target color.
// Applied to the gosling/family adult sprite img elements.
export const COLOR_FILTER: Record<GooseColor, string> = {
  white: "none",
  brown: "sepia(0.7) hue-rotate(-20deg) saturate(1.3) brightness(0.85)",
  pink: "sepia(0.6) hue-rotate(290deg) saturate(2.2) brightness(1.05)",
  yellow: "sepia(0.7) hue-rotate(0deg) saturate(2.4) brightness(1.1)",
  lightgreen: "sepia(0.6) hue-rotate(60deg) saturate(1.8) brightness(1.05)",
  amigablue: "sepia(0.6) hue-rotate(180deg) saturate(2.5) brightness(1.1)",
  black: "brightness(0.25) contrast(1.2)",
};

export type GooseSex = "m" | "f";

export type RosterEntry = {
  id: string;
  name: string;
  sex: GooseSex;
  color: GooseColor;
  bornAt: number; // wall-clock ms
  kind: "original" | "gosling" | "adult";
};

const NAMES = [
  "Ada", "Bytey", "Klompy", "Amiga", "Kickstart", "Workbench", "Guru",
  "Meditation", "Pixel", "Sprite", "Modem", "Floppy", "Turbo", "BBS",
  "ANSI", "Demoscene", "Nybble", "Bitmap", "Cracktro", "Goto10", "Segfault",
  "Null", "Void", "Heap", "Stack", "Cache", "Cookie", "Pingu", "Trasher",
  "Octocat", "Vimmy", "Emacs", "Sudo", "Kernel", "Daemon", "Lambda",
  "Tux", "Clippy", "Bonzi", "Paula", "Denise", "Agnus", "Copper", "Blitter",
  "Hex", "Patch", "Loop", "Trace", "Token", "Regex",
];

const STORAGE_KEY = "cracktro-goose-roster-v1";

export function loadRoster(): RosterEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is RosterEntry =>
        e && typeof e.id === "string" && typeof e.name === "string",
    );
  } catch {
    return [];
  }
}

export function saveRoster(entries: RosterEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function clearRoster() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("cracktro-goose-eggs-v2");
    localStorage.removeItem("cracktro-goose-goslings-v1");
    localStorage.removeItem("cracktro-goose-adults-v1");
  } catch {
    /* ignore */
  }
}

export function pickUniqueName(taken: Set<string>): string {
  const pool = NAMES.filter((n) => !taken.has(n));
  if (pool.length === 0) {
    // fallback: append number suffix
    return `Bit${Math.floor(Math.random() * 9999)}`;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickRandomSex(): GooseSex {
  return Math.random() < 0.5 ? "m" : "f";
}

export function pickRandomAdultColor(): GooseColor {
  return ADULT_COLORS[Math.floor(Math.random() * ADULT_COLORS.length)];
}

export function formatAge(bornAt: number, now = Date.now()): string {
  const ms = Math.max(0, now - bornAt);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Module-level pub/sub so the roster window updates whenever the family
// changes (egg laid → gosling hatched → adult grown → adult passed away).
type Listener = () => void;
const listeners = new Set<Listener>();
let cached: RosterEntry[] = loadRoster();

export function getRoster(): RosterEntry[] {
  return cached;
}
export function setRoster(next: RosterEntry[]) {
  cached = next;
  saveRoster(next);
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}
export function subscribeRoster(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
