const STORAGE_KEY = "goose-learned-phrases";
const MAX_PHRASES = 120;
const MAX_TEXT_LEN = 90;
const MIN_TEXT_LEN = 3;
const MAX_PHRASE_WEIGHT = 4;
const TRAILING_EMPHASIS_RE = /[!?.\s]+$/;

type LearnedPhrase = {
  phrase: string;
  normalized: string;
  seen: number;
  lastSeenAt: number;
  users: string[];
};

type LearnedPhraseStore = {
  phrases: LearnedPhrase[];
};

const EMPTY_STORE: LearnedPhraseStore = { phrases: [] };

const SENSITIVE_RE =
  /(?:https?:\/\/|www\.|@\w+\.|\b\d{8,}\b|\b(?:token|password|passwd|secret|apikey|api[-_ ]?key|bearer)\b)/i;

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizePhrase(text: string) {
  return normalizeWhitespace(text).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").toLowerCase();
}

function sanitizeCandidate(text: string): string | null {
  const clean = normalizeWhitespace(text);
  if (clean.length < MIN_TEXT_LEN || clean.length > MAX_TEXT_LEN) return null;
  if (SENSITIVE_RE.test(clean)) return null;
  if (!/[a-z0-9]/i.test(clean)) return null;
  return clean;
}

function parseStore(raw: string | null): LearnedPhraseStore {
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<LearnedPhraseStore>;
    if (!parsed || !Array.isArray(parsed.phrases)) return EMPTY_STORE;
    const phrases = parsed.phrases
      .filter((entry) => !!entry && typeof entry.phrase === "string" && typeof entry.normalized === "string")
      .map((entry) => ({
        phrase: normalizeWhitespace(entry.phrase),
        normalized: normalizePhrase(entry.normalized),
        seen: Number.isFinite(entry.seen) ? Math.max(1, Math.floor(entry.seen)) : 1,
        lastSeenAt: Number.isFinite(entry.lastSeenAt) ? entry.lastSeenAt : Date.now(),
        users: Array.isArray(entry.users)
          ? entry.users.filter((user) => typeof user === "string" && user.length > 0).slice(0, 5)
          : [],
      }));
    return { phrases };
  } catch {
    return EMPTY_STORE;
  }
}

function readStore(): LearnedPhraseStore {
  if (typeof localStorage === "undefined") return EMPTY_STORE;
  try {
    return parseStore(localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(store: LearnedPhraseStore) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota/storage errors.
  }
}

function topRecentPhrases(phrases: LearnedPhrase[]) {
  return phrases
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, MAX_PHRASES)
    .sort((a, b) => b.seen - a.seen || b.lastSeenAt - a.lastSeenAt);
}

export function learnPhraseFromOneliner(text: string, username = ""): string | null {
  const phrase = sanitizeCandidate(text);
  if (!phrase) return null;

  const normalized = normalizePhrase(phrase);
  const store = readStore();
  const existing = store.phrases.find((entry) => entry.normalized === normalized);
  if (existing) {
    existing.seen += 1;
    existing.lastSeenAt = Date.now();
    if (username) {
      existing.users = [username, ...existing.users.filter((u) => u !== username)].slice(0, 5);
    }
  } else {
    store.phrases.push({
      phrase,
      normalized,
      seen: 1,
      lastSeenAt: Date.now(),
      users: username ? [username] : [],
    });
  }

  store.phrases = topRecentPhrases(store.phrases);
  writeStore(store);
  return phrase;
}

export function getLearnedPhrases(): string[] {
  return readStore().phrases.map((entry) => entry.phrase);
}

export function pickLearnedPhrase(): string | null {
  const phrases = readStore().phrases;
  if (!phrases.length) return null;
  const weighted = phrases.flatMap((entry) =>
    Array(Math.min(MAX_PHRASE_WEIGHT, entry.seen)).fill(entry.phrase),
  );
  return weighted[Math.floor(Math.random() * weighted.length)] ?? phrases[0].phrase;
}

export function isEmphaticLine(text: string): boolean {
  if (!text) return false;
  if (/!{2,}|\?{2,}/.test(text)) return true;
  const lettersOnly = text.replace(/[^a-z]/gi, "");
  if (lettersOnly.length >= 4 && lettersOnly === lettersOnly.toUpperCase()) return true;
  return /!/.test(text);
}

export function findLearnedTrigger(text: string): string | null {
  const phrase = sanitizeCandidate(text);
  if (!phrase || !isEmphaticLine(text)) return null;
  const normalized = normalizePhrase(phrase).replace(TRAILING_EMPHASIS_RE, "");
  for (const learned of readStore().phrases) {
    const learnedNorm = learned.normalized.replace(TRAILING_EMPHASIS_RE, "");
    if (!learnedNorm) continue;
    if (normalized === learnedNorm) return learned.phrase;
  }
  return null;
}

export const __testing = {
  STORAGE_KEY,
  sanitizeCandidate,
  normalizePhrase,
  parseStore,
};
