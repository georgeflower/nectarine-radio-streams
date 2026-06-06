// Pure helpers for the wall-clock egg → hatch flow used by GooseFamily.
// Kept side-effect-free so tests can drive the logic deterministically.

export const HATCH_MIN_MS = 18_000;
export const HATCH_MAX_MS = 32_000;

export type Egg = {
  id: string;
  x: number;
  y: number;
  laidAt: number;
  hatchAt: number;
};

export type HatchResult = {
  stillEggs: Egg[];
  hatched: Egg[];
};

/**
 * Split eggs into still-incubating and hatched buckets at wall-clock time `now`.
 * Optional `slotsAvailable` caps how many can hatch this tick (overflow stays
 * in `stillEggs` so they can hatch later).
 */
export function hatchDueEggs(
  eggs: readonly Egg[],
  now: number,
  slotsAvailable: number = Number.POSITIVE_INFINITY,
): HatchResult {
  const stillEggs: Egg[] = [];
  const hatched: Egg[] = [];
  let slots = Math.max(0, slotsAvailable);
  for (const egg of eggs) {
    if (egg.hatchAt <= now && slots > 0) {
      hatched.push(egg);
      slots -= 1;
    } else {
      stillEggs.push(egg);
    }
  }
  return { stillEggs, hatched };
}

/** Returns true if the egg's hatch time falls within the documented 18–32 s window. */
export function isHatchWindowValid(egg: Pick<Egg, "laidAt" | "hatchAt">): boolean {
  const delta = egg.hatchAt - egg.laidAt;
  return delta >= HATCH_MIN_MS && delta <= HATCH_MAX_MS;
}

/** Build an egg with a hatch time drawn from the documented window. */
export function makeEgg(args: {
  id: string;
  x: number;
  y: number;
  laidAt: number;
  rand?: () => number;
}): Egg {
  const rand = args.rand ?? Math.random;
  const span = HATCH_MAX_MS - HATCH_MIN_MS;
  return {
    id: args.id,
    x: args.x,
    y: args.y,
    laidAt: args.laidAt,
    hatchAt: args.laidAt + HATCH_MIN_MS + rand() * span,
  };
}
