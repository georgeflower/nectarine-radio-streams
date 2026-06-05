import type { GooseLifeState } from "./types";

export const GOOSE_LIFE_STORAGE_KEY = "cracktro-goose-life-state-v1";

export function loadGooseLifeState(): GooseLifeState | null {
  try {
    const raw = localStorage.getItem(GOOSE_LIFE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GooseLifeState;
    if (!parsed || !Array.isArray(parsed.geese)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGooseLifeState(state: GooseLifeState) {
  try {
    localStorage.setItem(GOOSE_LIFE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota/storage issues
  }
}
