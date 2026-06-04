export type GooseSceneEra = "intro" | "warmed" | "party" | "veteran";

export type GooseSceneEraConfig = {
  id: GooseSceneEra;
  label: string;
  minListeningMs: number;
  scrollerSpeed: number;
  infoBarOpacity: number;
};

const ERA_CONFIG: GooseSceneEraConfig[] = [
  { id: "intro", label: "Fresh", minListeningMs: 0, scrollerSpeed: 1, infoBarOpacity: 0.85 },
  { id: "warmed", label: "Warmed", minListeningMs: 20 * 60_000, scrollerSpeed: 1.05, infoBarOpacity: 0.88 },
  { id: "party", label: "Late", minListeningMs: 75 * 60_000, scrollerSpeed: 1.1, infoBarOpacity: 0.92 },
  { id: "veteran", label: "Veteran", minListeningMs: 180 * 60_000, scrollerSpeed: 1.16, infoBarOpacity: 0.96 },
];

export function getSceneEraFromListeningMs(listeningMs: number): GooseSceneEra {
  const safeMs = Math.max(0, listeningMs);
  let era: GooseSceneEra = "intro";
  for (const candidate of ERA_CONFIG) {
    if (safeMs >= candidate.minListeningMs) era = candidate.id;
  }
  return era;
}

export function getSceneEraConfig(era: GooseSceneEra): GooseSceneEraConfig {
  return ERA_CONFIG.find((entry) => entry.id === era) ?? ERA_CONFIG[0];
}
