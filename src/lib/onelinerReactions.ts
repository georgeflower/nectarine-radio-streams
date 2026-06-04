export type OnelinerReactionKind = "heart" | "laughter" | "wink";

const HEART_EMOJI_RE = /(?:❤️|♥|💖|💗|💕|💞|💘|💝|🧡|💛|💚|💙|💜|🤍|🖤|🤎)/u;
const LAUGHTER_EMOJI_RE = /(?:😂|🤣|😆|😹|😄|😃)/u;
const WINK_EMOJI_RE = /(?:😉|😜|😘|😏)/u;

const TOKEN = "A-Za-z0-9_";
// No leading boundary needed — heart tokens start with `<` or `&`, neither of
// which is a token character, so they naturally cannot form false compounds.
// `&(?:amp;)?lt;` matches both `&lt;` (HTML-entity) and `&amp;lt;` (double-escaped).
const HEART_ASCII_RE = new RegExp(
  `(?:<3+|</3|&(?:amp;)?lt;(?:3+|/3))(?=$|[^${TOKEN}])`,
  "i",
);
// Word-like tokens (lol/lmao/…/xd) need a leading non-token boundary to avoid
// partial matches.  Punctuation-prefixed tokens (:D/:-D) start with `:` which
// is already a non-token char, so no leading boundary is required for them.
const LAUGHTER_ASCII_RE = new RegExp(
  `(?:(^|[^${TOKEN}])(?:lol|lmao|rofl|haha|hehe|xd)|(?::d|:-d))(?=$|[^${TOKEN}])`,
  "i",
);
// All wink tokens start with `;` (a non-token char) so they can appear
// immediately after word characters (e.g. `nice;)`) without a leading boundary.
const WINK_ASCII_RE = new RegExp(
  `(?:;\\)|;-\\)|;d|;-d|;p|;-p)(?=$|[^${TOKEN}])`,
  "i",
);

export function detectOnelinerReaction(text: string): OnelinerReactionKind | null {
  if (!text) return null;
  if (HEART_EMOJI_RE.test(text) || HEART_ASCII_RE.test(text)) return "heart";
  if (LAUGHTER_EMOJI_RE.test(text) || LAUGHTER_ASCII_RE.test(text)) return "laughter";
  if (WINK_EMOJI_RE.test(text) || WINK_ASCII_RE.test(text)) return "wink";
  return null;
}
