import { findLearnedTrigger } from "@/lib/gooseLearnedPhrases";

export type GooseTriggerReaction = {
  key: string;
  echo: string;
  mode: "stun-freakout";
};

type TriggerRule = {
  key: string;
  match: RegExp;
  buildEcho: (text: string) => string;
};

const BASE_TRIGGER_RULES: TriggerRule[] = [
  {
    key: "whatta",
    match: /^\s*whatta!+/i,
    buildEcho: () => "Whatta!",
  },
];

function canonicalizePunctuation(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

export function detectGooseTriggerReaction(text: string): GooseTriggerReaction | null {
  const trimmed = canonicalizePunctuation(text);
  if (!trimmed) return null;

  for (const rule of BASE_TRIGGER_RULES) {
    if (rule.match.test(trimmed)) {
      return {
        key: rule.key,
        echo: rule.buildEcho(trimmed),
        mode: "stun-freakout",
      };
    }
  }

  const learned = findLearnedTrigger(trimmed);
  if (learned) {
    return {
      key: `learned:${learned.toLowerCase()}`,
      echo: learned,
      mode: "stun-freakout",
    };
  }

  return null;
}
