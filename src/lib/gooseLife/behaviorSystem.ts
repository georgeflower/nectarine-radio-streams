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

export function chooseNextBehavior(goose: Goose, nearbyCount: number): GooseState {
  if (!goose.alive) return "mourn";
  if (goose.parentIds && goose.ageHours < 6) return "follow";
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
