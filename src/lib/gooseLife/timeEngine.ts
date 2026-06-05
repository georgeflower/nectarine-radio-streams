export const HOUR_MS = 60 * 60 * 1000;
export const DAY_PER_HOUR_RATIO = 1;
export const LIFESPAN_HOURS = 48;

export const toHours = (ms: number) => ms / HOUR_MS;

export const ageFromBirth = (birthTimestamp: number, now: number) =>
  Math.max(0, toHours(Math.max(0, now - birthTimestamp)));

export const dayFromAgeHours = (ageHours: number) =>
  Math.max(1, Math.floor(ageHours * DAY_PER_HOUR_RATIO) + 1);
