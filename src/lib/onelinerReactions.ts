export type OnelinerReactionKind = "heart" | "laughter" | "wink";

const HEART_EMOJI_RE = /(?:❤️|♥|💖|💗|💕|💞|💘|💝|🧡|💛|💚|💙|💜|🤍|🖤|🤎)/u;
const LAUGHTER_EMOJI_RE = /(?:😂|🤣|😆|😹|😄|😃)/u;
const WINK_EMOJI_RE = /(?:😉|😜|😘|😏)/u;

const TOKEN = "A-Za-z0-9_";
const HEART_ASCII_RE = new RegExp(
  `(^|[^${TOKEN}])(?:<3+|</3|&lt;3+|&lt;/3)(?=$|[^${TOKEN}])`,
  "i",
);
const LAUGHTER_ASCII_RE = new RegExp(
  `(^|[^${TOKEN}])(?:lol|lmao|rofl|haha|hehe|xd|:d|:-d)(?=$|[^${TOKEN}])`,
  "i",
);
const WINK_ASCII_RE = new RegExp(
  `(^|[^${TOKEN}])(?:;\\)|;-\\)|;d|;-d|;p|;-p)(?=$|[^${TOKEN}])`,
  "i",
);

export function detectOnelinerReaction(text: string): OnelinerReactionKind | null {
  if (!text) return null;
  if (HEART_EMOJI_RE.test(text) || HEART_ASCII_RE.test(text)) return "heart";
  if (LAUGHTER_EMOJI_RE.test(text) || LAUGHTER_ASCII_RE.test(text)) return "laughter";
  if (WINK_EMOJI_RE.test(text) || WINK_ASCII_RE.test(text)) return "wink";
  return null;
}
