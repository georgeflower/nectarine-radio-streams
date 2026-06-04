const STORAGE_KEY = "goose-learned-lexicon-v1";
const MAX_TOKENS = 180;
const MAX_USERS_PER_TOKEN = 8;
const MAX_LINE_LEN = 220;
const MIN_TOKEN_LEN = 2;
const MAX_TOKEN_LEN = 18;
const MAX_UTTERANCE_LEN = 48;
const MS_PER_HOUR = 3_600_000;
const MIN_RECENCY_SCORE = 0.2;
const MAX_RECENCY_SCORE = 1.4;
const RECENCY_DECAY_HOURS = 24;
const MAX_VARIETY_BOOST = 0.5;
const VARIETY_BOOST_PER_USER = 0.05;
const SCORE_EPSILON = 0.0001;
const USERNAME_RE = /^[a-z0-9_]{2,20}$/i;

export type TokenCategory =
  | "greeting"
  | "laughter"
  | "wink"
  | "heart"
  | "hype"
  | "farewell"
  | "slang"
  | "emphasis"
  | "neutral";

export type LexiconMood = "calm" | "friendly" | "hype" | "chaotic" | "silly";

export type LexiconStyleFlag = "all-caps" | "emoticon" | "punct-heavy" | "elongated";

export type LearnedLexiconToken = {
  token: string;
  normalized: string;
  category: TokenCategory;
  seen: number;
  lastSeenAt: number;
  users: string[];
  flags: LexiconStyleFlag[];
};

export type LearnedLexiconSnapshot = {
  tokens: LearnedLexiconToken[];
  updatedAt: number;
  totalSeen: number;
};

type LexiconStore = {
  tokens: LearnedLexiconToken[];
  updatedAt: number;
};

const EMPTY_STORE: LexiconStore = {
  tokens: [],
  updatedAt: 0,
};

const URL_PATTERN = String.raw`https?:\/\/|www\.`;
const EMAIL_PATTERN = String.raw`\b\S+@\S+\.\S+\b`;
const LONG_NUMBER_PATTERN = String.raw`\b\d{8,}\b`;
const SECRET_KEYWORD_PATTERN = String.raw`\b(?:token|password|passwd|secret|apikey|api[-_ ]?key|bearer)\b`;
const SENSITIVE_RE = new RegExp(
  `(?:${URL_PATTERN}|${EMAIL_PATTERN}|${LONG_NUMBER_PATTERN}|${SECRET_KEYWORD_PATTERN})`,
  "i",
);
const SENSITIVE_FRAGMENT_RE = new RegExp(
  `(?:${URL_PATTERN}\\S*|${EMAIL_PATTERN}|${LONG_NUMBER_PATTERN}|${SECRET_KEYWORD_PATTERN}(?:\\s*[=:]\\s*\\S+)*)`,
  "gi",
);

const HEART_TOKEN_PATTERN = String.raw`<3+|<\/3|\^_\^`;
const EMOTICON_TOKEN_PATTERN = String.raw`:\)+|:-\)+|:d|:-d|;\)|;-\)|;d|;-d|;p|;-p|xd|x-d|x\)|x\(`;
const LAUGHTER_TOKEN_PATTERN = String.raw`lol|lmao|rofl|haha|hehe`;
const WORD_TOKEN_PATTERN = String.raw`\b[a-z][a-z0-9_'-]{1,17}\b`;
const EMPHASIS_TOKEN_PATTERN = String.raw`[!?]{2,}|\.{3,}`;
const TOKEN_CANDIDATE_RE = new RegExp(
  `(?:${HEART_TOKEN_PATTERN}|${EMOTICON_TOKEN_PATTERN}|${LAUGHTER_TOKEN_PATTERN}|${WORD_TOKEN_PATTERN}|${EMPHASIS_TOKEN_PATTERN})`,
  "gi",
);
const ALL_CAPS_RE = /^[A-Z0-9!?._-]{2,}$/;
const ELONGATED_RE = /(.)\1\1/;
const PUNCT_HEAVY_RE = /[!?]{2,}|\.{3,}/;
const EMOTICON_RE = /[:;xX8][-]?[)dDpP(]|<3/;

const HEART_TOKENS = new Set(["<3", "</3", "♥", "❤️", "heart", "hearts"]);
const GREETING_TOKENS = new Set([
  "hi",
  "hey",
  "hello",
  "yo",
  "sup",
  "greetings",
  "moin",
  "hola",
  "ahoy",
]);
const FAREWELL_TOKENS = new Set(["bye", "cya", "cu", "later", "gn", "nite", "goodnight", "bb"]);
const LAUGHTER_TOKENS = new Set(["lol", "lmao", "rofl", "haha", "hehe", "xd", "x-d", ":d", ":-d"]);
const WINK_TOKENS = new Set([";)", ";-)", ";d", ";-d", ";p", ";-p"]);
const HYPE_TOKENS = new Set([
  "hype",
  "woot",
  "whatta",
  "boom",
  "party",
  "demo",
  "scene",
  "epic",
  "awesome",
  "nice",
  "yay",
  "omg",
  "rush",
]);
const SLANG_TOKENS = new Set([
  "w00t",
  "1337",
  "noob",
  "prods",
  "compo",
  "tracker",
  "mod",
  "asm",
  "pixel",
  "raster",
  "copper",
]);

const MOOD_BOOSTS: Record<LexiconMood, Partial<Record<TokenCategory, number>>> = {
  calm: { neutral: 1.25, farewell: 1.1, emphasis: 0.85, hype: 0.85 },
  friendly: { greeting: 1.3, heart: 1.2, wink: 1.15, neutral: 1.05 },
  hype: { hype: 1.35, emphasis: 1.2, laughter: 1.1 },
  chaotic: { emphasis: 1.35, slang: 1.15, hype: 1.1 },
  silly: { laughter: 1.35, wink: 1.2, slang: 1.1, heart: 1.05 },
};

const MOOD_TEMPLATES: Record<LexiconMood, Array<Array<TokenCategory>>> = {
  calm: [["neutral"], ["greeting", "neutral"], ["neutral", "farewell"]],
  friendly: [["greeting", "heart"], ["greeting", "wink"], ["heart", "neutral"]],
  hype: [["hype", "emphasis"], ["greeting", "hype"], ["hype", "laughter"]],
  chaotic: [["slang", "emphasis"], ["hype", "emphasis"], ["laughter", "emphasis"]],
  silly: [["laughter", "wink"], ["laughter", "heart"], ["slang", "laughter"]],
};
const FALLBACK_TOKEN_BY_CATEGORY: Record<TokenCategory, string> = {
  greeting: "honk",
  laughter: "hehe",
  wink: ";)",
  heart: "<3",
  hype: "boom",
  farewell: "bye",
  slang: "scene",
  emphasis: "!!",
  neutral: "honk",
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeToken(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

function stripSensitiveFragments(text: string): string {
  return text.replace(SENSITIVE_FRAGMENT_RE, " ");
}

function clampToken(raw: string): string {
  return raw.slice(0, MAX_TOKEN_LEN);
}

function extractStyleFlags(token: string, source: string): LexiconStyleFlag[] {
  const flags = new Set<LexiconStyleFlag>();
  if (ALL_CAPS_RE.test(source) && /[A-Z]/.test(source)) flags.add("all-caps");
  if (ELONGATED_RE.test(source)) flags.add("elongated");
  if (PUNCT_HEAVY_RE.test(token)) flags.add("punct-heavy");
  if (EMOTICON_RE.test(token)) flags.add("emoticon");
  return Array.from(flags);
}

function isSafeToken(token: string): boolean {
  if (!token) return false;
  if (token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN) return false;
  if (SENSITIVE_RE.test(token)) return false;
  if (/\d{5,}/.test(token)) return false;
  if (!/[a-z<:;!?.]/i.test(token)) return false;
  return true;
}

function parseStore(raw: string | null): LexiconStore {
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<LexiconStore>;
    if (!parsed || !Array.isArray(parsed.tokens)) return EMPTY_STORE;
    const tokens = parsed.tokens
      .filter((entry) => entry && typeof entry.token === "string")
      .map((entry) => {
        const token = normalizeWhitespace(entry.token);
        const normalized = normalizeToken(typeof entry.normalized === "string" ? entry.normalized : token);
        const category = classifyToken(token);
        const seen = Number.isFinite(entry.seen) ? Math.max(1, Math.floor(entry.seen)) : 1;
        const lastSeenAt = Number.isFinite(entry.lastSeenAt) ? entry.lastSeenAt : Date.now();
        const users = Array.isArray(entry.users)
          ? entry.users.filter((u) => typeof u === "string" && u.trim().length > 0).slice(0, MAX_USERS_PER_TOKEN)
          : [];
        const flags = Array.isArray(entry.flags)
          ? entry.flags.filter((f): f is LexiconStyleFlag =>
              f === "all-caps" || f === "emoticon" || f === "punct-heavy" || f === "elongated",
            )
          : [];
        return { token, normalized, category, seen, lastSeenAt, users, flags };
      })
      .filter((entry) => isSafeToken(entry.token));

    return {
      tokens: trimTokens(tokens),
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : Date.now(),
    };
  } catch {
    return EMPTY_STORE;
  }
}

function readStore(): LexiconStore {
  if (typeof localStorage === "undefined") return EMPTY_STORE;
  try {
    return parseStore(localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(store: LexiconStore): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage/quota failures
  }
}

function trimTokens(tokens: LearnedLexiconToken[]): LearnedLexiconToken[] {
  return tokens
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, MAX_TOKENS)
    .sort((a, b) => b.seen - a.seen || b.lastSeenAt - a.lastSeenAt || a.normalized.localeCompare(b.normalized));
}

function scoreRecency(lastSeenAt: number): number {
  const ageHours = Math.max(0, (Date.now() - lastSeenAt) / MS_PER_HOUR);
  return Math.max(MIN_RECENCY_SCORE, MAX_RECENCY_SCORE - ageHours / RECENCY_DECAY_HOURS);
}

function scoreToken(entry: LearnedLexiconToken, mood: LexiconMood): number {
  const moodBoost = MOOD_BOOSTS[mood][entry.category] ?? 1;
  const varietyBoost = 1 + Math.min(MAX_VARIETY_BOOST, entry.users.length * VARIETY_BOOST_PER_USER);
  return entry.seen * scoreRecency(entry.lastSeenAt) * moodBoost * varietyBoost;
}

function dedupeTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function tokenizeOneliner(text: string): string[] {
  const clean = normalizeWhitespace(text).slice(0, MAX_LINE_LEN);
  if (!clean) return [];
  const scrubbed = normalizeWhitespace(stripSensitiveFragments(clean));
  if (!scrubbed) return [];

  const matches = scrubbed.match(TOKEN_CANDIDATE_RE) ?? [];
  const tokens = matches
    .map((token) => clampToken(normalizeWhitespace(token)))
    .filter((token) => isSafeToken(token));

  return dedupeTokens(tokens).slice(0, 12);
}

export function classifyToken(token: string): TokenCategory {
  const normalized = normalizeToken(token);
  if (!normalized) return "neutral";
  if (/^[!?]{2,}|\.{3,}|!\?$|\?!$/.test(normalized)) return "emphasis";
  if (HEART_TOKENS.has(normalized) || /<3+/.test(normalized)) return "heart";
  if (WINK_TOKENS.has(normalized) || /;\)|;d|;p/.test(normalized)) return "wink";
  if (LAUGHTER_TOKENS.has(normalized) || /^(ha){2,}$/.test(normalized)) return "laughter";
  if (GREETING_TOKENS.has(normalized)) return "greeting";
  if (FAREWELL_TOKENS.has(normalized)) return "farewell";
  if (HYPE_TOKENS.has(normalized)) return "hype";
  if (SLANG_TOKENS.has(normalized) || /\d/.test(normalized)) return "slang";
  return "neutral";
}

export function getLearnedLexicon(): LearnedLexiconSnapshot {
  const store = readStore();
  const tokens = trimTokens([...store.tokens]);
  return {
    tokens,
    updatedAt: store.updatedAt,
    totalSeen: tokens.reduce((sum, entry) => sum + entry.seen, 0),
  };
}

export function learnLexiconFromOneliner(text: string, username = ""): LearnedLexiconSnapshot {
  const source = normalizeWhitespace(text);
  if (!source || source.length > MAX_LINE_LEN) {
    return getLearnedLexicon();
  }

  const tokens = tokenizeOneliner(source);
  if (!tokens.length) return getLearnedLexicon();

  const store = readStore();
  const now = Date.now();

  for (const token of tokens) {
    const normalized = normalizeToken(token);
    const existing = store.tokens.find((entry) => entry.normalized === normalized);
    const category = classifyToken(token);
    const flags = extractStyleFlags(token, source);

    if (existing) {
      existing.seen += 1;
      existing.lastSeenAt = now;
      existing.category = category;
      existing.flags = Array.from(new Set([...existing.flags, ...flags]));
      if (username) {
        existing.users = [username, ...existing.users.filter((u) => u !== username)].slice(0, MAX_USERS_PER_TOKEN);
      }
      continue;
    }

    store.tokens.push({
      token,
      normalized,
      category,
      seen: 1,
      lastSeenAt: now,
      users: username ? [username] : [],
      flags,
    });
  }

  store.tokens = trimTokens(store.tokens);
  store.updatedAt = now;
  writeStore(store);
  return getLearnedLexicon();
}

export function deriveOnelinerMood(lines: Array<{ text: string; username?: string }>): LexiconMood {
  const recent = lines.slice(-12);
  if (!recent.length) return "calm";

  let friendlyScore = 0;
  let hypeScore = 0;
  let chaosScore = 0;
  let sillyScore = 0;

  for (const line of recent) {
    const text = normalizeWhitespace(line.text);
    if (!text) continue;
    if (/[!?]{3,}/.test(text) || /\b[A-Z]{4,}\b/.test(text)) chaosScore += 2;
    if (/[:;xX]-?[)dDpP]|<3/.test(text)) friendlyScore += 1;

    const tokens = tokenizeOneliner(text);
    for (const token of tokens) {
      const category = classifyToken(token);
      if (category === "heart" || category === "greeting" || category === "wink") friendlyScore += 1;
      if (category === "hype" || category === "emphasis") hypeScore += 1;
      if (category === "slang" || category === "emphasis") chaosScore += 1;
      if (category === "laughter" || category === "wink") sillyScore += 1;
    }
  }

  if (chaosScore >= Math.max(6, hypeScore + 2)) return "chaotic";
  if (hypeScore >= Math.max(5, friendlyScore + 1)) return "hype";
  if (sillyScore >= Math.max(4, friendlyScore)) return "silly";
  if (friendlyScore >= 3) return "friendly";
  return "calm";
}

export function pickTokenByCategory(category: TokenCategory, mood: LexiconMood = "friendly"): string | null {
  const { tokens } = getLearnedLexicon();
  const candidates = tokens.filter((entry) => entry.category === category);
  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    const diff = scoreToken(b, mood) - scoreToken(a, mood);
    if (Math.abs(diff) > SCORE_EPSILON) return diff > 0 ? 1 : -1;
    return b.lastSeenAt - a.lastSeenAt || a.normalized.localeCompare(b.normalized);
  });

  return sorted[0]?.token ?? null;
}

function cleanOutputToken(token: string): string | null {
  const clean = token.replace(/[^a-z0-9<3:;!?._' -]/gi, "").trim();
  if (!clean) return null;
  if (!isSafeToken(clean)) return null;
  return clean;
}

export function buildBirdUtterance(context?: {
  mood?: LexiconMood;
  username?: string;
  maxLen?: number;
}): string | null {
  const mood = context?.mood ?? "friendly";
  const maxLen = Math.max(12, Math.min(context?.maxLen ?? MAX_UTTERANCE_LEN, 96));
  const templates = MOOD_TEMPLATES[mood] ?? MOOD_TEMPLATES.friendly;
  const template = templates[0] ?? ["neutral"];

  const chosen: string[] = [];
  for (const category of template) {
    const token = pickTokenByCategory(category, mood)
      ?? (category !== "neutral" ? pickTokenByCategory("neutral", mood) : null)
      ?? FALLBACK_TOKEN_BY_CATEGORY[category]
      ?? FALLBACK_TOKEN_BY_CATEGORY.neutral;

    const safe = cleanOutputToken(token);
    if (safe) chosen.push(safe);
  }

  let utterance = chosen.join(" ").replace(/\s+([!?.,])/g, "$1").trim();
  if (context?.username && USERNAME_RE.test(context.username)) {
    utterance = `${context.username}: ${utterance}`;
  }
  if (utterance.length > maxLen) utterance = utterance.slice(0, maxLen).trim();
  if (!utterance || utterance.length < 2 || SENSITIVE_RE.test(utterance)) return null;
  return utterance;
}

export const __testing = {
  STORAGE_KEY,
  SENSITIVE_RE,
  parseStore,
  trimTokens,
  normalizeToken,
  isSafeToken,
  extractStyleFlags,
};
