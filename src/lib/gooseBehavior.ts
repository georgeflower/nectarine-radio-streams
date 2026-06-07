export type GooseMode = "fly" | "approach" | "land" | "startle" | "ground";

export const STAMINA_MAX = 100;
export const STAMINA_TIRED_THRESHOLD = 24;
export const STAMINA_RECOVER_THRESHOLD = 80;
export const STAMINA_DRAIN_PER_SECOND = 7;
export const STAMINA_RECOVER_PER_SECOND = 26;

export const updateGooseStamina = (stamina: number, mode: GooseMode, dtSeconds: number) => {
  if (dtSeconds <= 0) return stamina;
  const next =
    mode === "fly" || mode === "approach"
      ? stamina - STAMINA_DRAIN_PER_SECOND * dtSeconds
      : mode === "land" || mode === "ground"
        ? stamina + STAMINA_RECOVER_PER_SECOND * dtSeconds
        : stamina;
  return Math.max(0, Math.min(STAMINA_MAX, next));
};

export const gooseIsTired = (stamina: number) => stamina <= STAMINA_TIRED_THRESHOLD;
export const gooseIsRecovered = (stamina: number) => stamina >= STAMINA_RECOVER_THRESHOLD;

export type PerchKind = "letter" | "window";

export type PerchCandidate<T = unknown> = {
  ref: T;
  kind: PerchKind;
  char: string;
  left: number;
  top: number;
  width: number;
};

export type SelectedPerch<T = unknown> = PerchCandidate<T> & {
  offset: number;
  anchorX: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const resolveOffset = (
  c: PerchCandidate,
  fromX: number | null,
  random: () => number,
): number => {
  if (c.kind === "letter") return 0.5;
  if (fromX === null) return 0.15 + random() * 0.7;
  return clamp((fromX - c.left) / Math.max(1, c.width), 0.15, 0.85);
};

export const pickPerchCandidate = <T>(
  candidates: PerchCandidate<T>[],
  from: { x: number; y: number } | null,
  random: () => number = Math.random,
  occupied: Array<{ ref: unknown; anchorX: number }> = [],
  personalSpacePx = 36,
): SelectedPerch<T> | null => {
  if (candidates.length === 0) return null;

  const isBlocked = (ref: T, anchorX: number) =>
    occupied.some((o) => o.ref === (ref as unknown) && Math.abs(o.anchorX - anchorX) < personalSpacePx);

  if (!from) {
    // Try a few random picks; fall through to nearest-style search if all blocked.
    for (let attempt = 0; attempt < 6; attempt++) {
      const c = candidates[Math.floor(random() * candidates.length)];
      const offset = resolveOffset(c, null, random);
      const anchorX = c.left + c.width * offset;
      if (!isBlocked(c.ref, anchorX)) {
        return { ...c, offset, anchorX };
      }
    }
  }

  let best: SelectedPerch<T> | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const offset = resolveOffset(c, from?.x ?? null, random);
    const anchorX = c.left + c.width * offset;
    if (isBlocked(c.ref, anchorX)) continue;
    const distance = from ? Math.hypot(anchorX - from.x, c.top - from.y) : random();
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { ...c, offset, anchorX };
    }
  }
  return best;
};
