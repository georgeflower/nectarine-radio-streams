import type { Goose, GooseLifeState } from "./types";

export type ChatReaction = {
  forceState?: Goose["state"];
  mood?: Goose["mood"];
  affinityBoost?: number;
  gather?: boolean;
  targetName?: string;
  triggerMourning?: boolean;
};

const POSITIVE_WORDS = ["love", "great", "nice", "awesome", "sweet", "cute", "honk"];
const NEGATIVE_WORDS = ["sad", "angry", "hate", "rip", "bye", "cry"];

export function parseChatReaction(text: string, geese: Goose[]): ChatReaction | null {
  const lower = text.toLowerCase();
  if (!lower.trim()) return null;

  const targetName = geese.find((g) => lower.includes(g.name.toLowerCase()))?.name;

  if (lower.includes("food")) return { forceState: "eat", mood: "happy", targetName };
  if (lower.includes("fly")) return { forceState: "fly", mood: "playful", targetName };
  if (lower.includes("hello") || lower.includes("geese") || lower.includes("honk")) {
    return { gather: true, forceState: "interact", mood: "happy", targetName };
  }
  if (lower.includes("love")) return { affinityBoost: 8, mood: "happy", targetName };
  if (lower.includes("rip")) return { triggerMourning: true, mood: "sad", targetName };

  const sentiment =
    POSITIVE_WORDS.some((word) => lower.includes(word))
      ? "positive"
      : NEGATIVE_WORDS.some((word) => lower.includes(word))
        ? "negative"
        : "neutral";

  if (sentiment === "positive") return { mood: "happy", affinityBoost: 2, targetName };
  if (sentiment === "negative") return { mood: "sad", targetName };
  return targetName ? { targetName } : null;
}

export function maybeApplyLatestOneliner(state: GooseLifeState, text: string, key: string): GooseLifeState {
  if (state.processedOnelinerKey === key) return state;
  const reaction = parseChatReaction(text, state.geese.filter((g) => g.alive));
  if (!reaction) return { ...state, processedOnelinerKey: key };

  const alive = state.geese.filter((g) => g.alive);
  const centerX = alive.reduce((sum, g) => sum + g.position.x, 0) / Math.max(1, alive.length);
  const centerY = alive.reduce((sum, g) => sum + g.position.y, 0) / Math.max(1, alive.length);
  const target = reaction.targetName
    ? state.geese.find((g) => g.name === reaction.targetName)
    : null;

  return {
    ...state,
    processedOnelinerKey: key,
    geese: state.geese.map((goose, idx) => {
      if (!goose.alive) return goose;
      const selected = !target || goose.id === target.id;
      const next: Goose = { ...goose, relationships: { ...goose.relationships } };
      if (selected && reaction.forceState) next.state = reaction.forceState;
      if (selected && reaction.mood) next.mood = reaction.mood;
      if (reaction.gather) {
        next.velocity = {
          x: (centerX - goose.position.x) * 0.08,
          y: (centerY - goose.position.y) * 0.08,
        };
      }
      if (reaction.affinityBoost && idx < state.geese.length - 1) {
        const partner = state.geese[idx + 1];
        if (partner) next.relationships[partner.id] = (next.relationships[partner.id] ?? 0) + reaction.affinityBoost;
      }
      if (reaction.triggerMourning) {
        next.mood = "mourning";
        next.state = "mourn";
        next.mournUntil = Date.now() + 10 * 60_000;
      }
      return next;
    }),
  };
}
