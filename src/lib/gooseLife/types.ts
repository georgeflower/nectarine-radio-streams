export type GooseSex = "male" | "female";
export type GooseMood = "neutral" | "happy" | "playful" | "sad" | "mourning";

export type GooseState =
  | "idle"
  | "waddle"
  | "fly"
  | "eat"
  | "sleep"
  | "play"
  | "interact"
  | "mourn"
  | "follow";

export interface Egg {
  laidAt: number;
  hatchAfterHours: 4;
}

export interface Goose {
  id: string;
  name: string;
  sex: GooseSex;
  ageHours: number;
  birthTimestamp: number;
  alive: boolean;
  mood: GooseMood;
  state: GooseState;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  relationships: Record<string, number>;
  pregnant?: boolean;
  eggs?: Egg[];
  personality: "calm" | "bold" | "playful" | "curious";
  speedModifier: number;
  paletteShift: number;
  targetId?: string;
  nextBehaviorAt: number;
  pregnancyUntil?: number;
  mournUntil?: number;
  deathAt?: number;
  funeralEndsAt?: number;
  bodyFadeStartAt?: number;
  bodyRemoved?: boolean;
  parentIds?: [string, string] | [string];
}

export interface GooseLifeState {
  geese: Goose[];
  accumulatedOpenMs: number;
  lastTickAt: number;
  lastReproductionAt: number;
  processedOnelinerKey: string | null;
  funeralPulseUntil?: number;
}

export interface StageBounds {
  width: number;
  height: number;
}
