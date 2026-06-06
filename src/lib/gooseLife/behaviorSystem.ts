import type { Goose, GooseState } from "./types";

const BEHAVIORS: GooseState[] = ["idle", "waddle", "fly", "eat", "sleep", "play", "interact"];

const WEIGHTS_BY_MOOD: Record<Goose["mood"], Record<GooseState, number>> = {
  neutral: { idle: 2, waddle: 2, fly: 2, eat: 1, sleep: 1, play: 1, interact: 2, mourn: 0, follow: 0 },
  happy: { idle: 1, waddle: 2, fly: 3, eat: 1, sleep: 1, play: 3, interact: 3, mourn: 0, follow: 0 },
  playful: { idle: 1, waddle: 2, fly: 3, eat: 1, sleep: 1, play: 4, interact: 3, mourn: 0, follow: 0 },
  sad: { idle: 3, waddle: 1, fly: 1, eat: 1, sleep: 2, play: 0, interact: 1, mourn: 1, follow: 0 },
  mourning: { idle: 3, waddle: 1, fly: 0, eat: 0, sleep: 2, play: 0, interact: 1, mourn: 4, follow: 0 },
};

export const nextBehaviorAt = (now: number) => now + (20_000 + Math.random() * 20_000);

const GROUNDED_BEHAVIORS: GooseState[] = ["idle", "waddle", "eat", "sleep", "interact"];
const GROUNDED_WEIGHTS: Record<GooseState, number> = {
  idle: 2, waddle: 5, fly: 0, eat: 1, sleep: 1, play: 0, interact: 2, mourn: 0, follow: 0,
};

export function chooseNextBehavior(goose: Goose, nearbyCount: number): GooseState {
  if (!goose.alive) return "mourn";

  // Grounded geese (e.g. "Waddle") never enter fly state — they walk the floor only.
  if (goose.grounded) {
    const weights = { ...GROUNDED_WEIGHTS };
    if (nearbyCount > 0) weights.interact += 2;
    let total = 0;
    for (const key of GROUNDED_BEHAVIORS) total += Math.max(0, weights[key]);
    if (total <= 0) return "waddle";
    let roll = Math.random() * total;
    for (const key of GROUNDED_BEHAVIORS) {
      roll -= Math.max(0, weights[key]);
      if (roll <= 0) return key;
    }
    return "waddle";
  }

  if (goose.parentIds && goose.ageHours < 6) {
    if (goose.ageHours < 1.2) return Math.random() < 0.8 ? "follow" : "waddle";
    if (goose.ageHours < 3.5) {
      const pick = Math.random();
      if (pick < 0.45) return "follow";
      if (pick < 0.72) return "waddle";
      if (pick < 0.87) return "play";
      return "sleep";
    }
    const pick = Math.random();
    if (pick < 0.4) return "follow";
    if (pick < 0.65) return "waddle";
    if (pick < 0.88) return "play";
    return "eat";
  }
  if (goose.mood === "mourning") return "mourn";

  const weights = { ...WEIGHTS_BY_MOOD[goose.mood] };
  if (nearbyCount > 0) {
    weights.interact += 2;
    weights.play += 1;
  }
  if (goose.ageHours < 2) {
    weights.sleep += 2;
    weights.play += 1;
  }

  let total = 0;
  for (const key of BEHAVIORS) total += Math.max(0, weights[key]);
  if (total <= 0) return "idle";

  let roll = Math.random() * total;
  for (const key of BEHAVIORS) {
    roll -= Math.max(0, weights[key]);
    if (roll <= 0) return key;
  }
  return "idle";
}
