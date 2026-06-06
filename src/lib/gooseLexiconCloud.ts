// Cloud-shared goose lexicon sync.
//
// Strategy (designed to stay well inside the Lovable Cloud free tier):
//  - Local writes still happen in `gooseLearnedLexicon.ts` (no behaviour change).
//  - New tokens are queued in memory and flushed in batches (max once / 60s,
//    or when the queue reaches 10 tokens) via a single edge function POST.
//  - Hard per-day caps on POST count and total tokens uploaded per browser,
//    persisted in localStorage so refreshes can't bypass them.
//  - A single GET per session, cached for 1h in localStorage. The cache key
//    is versioned so bumping the version invalidates stale caches on deploy.
//
// No realtime, no per-keystroke writes, no large payloads.

import {
  classifyToken,
  getLearnedLexicon,
  learnLexiconFromOneliner,
  tokenizeOneliner,
  type LearnedLexiconToken,
} from "@/lib/gooseLearnedLexicon";

const FUNCTION_NAME = "goose-lexicon-sync";
const FLUSH_INTERVAL_MS = 60_000;
const FLUSH_QUEUE_LIMIT = 10;
// Bump suffix to invalidate stale caches across all clients on next load.
const CACHE_VERSION = "v2";
const FETCH_CACHE_KEY = `goose-lexicon-cloud-cache-${CACHE_VERSION}`;
const BUDGET_KEY = `goose-lexicon-cloud-budget-${CACHE_VERSION}`;
const LEGACY_KEYS = ["goose-lexicon-cloud-cache-v1"];
const FETCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_QUEUE = 60;

// Hard per-day safety caps (per browser).
const MAX_POSTS_PER_DAY = 20;
const MAX_TOKENS_PER_DAY = 200;
const MAX_GETS_PER_DAY = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

type QueuedToken = {
  token: string;
  category: string;
  flags: string[];
};

type CachedFetch = {
  at: number;
  tokens: Array<{ token: string; category?: string }>;
};

type DailyBudget = {
  day: number; // floor(Date.now() / DAY_MS)
  posts: number;
  tokens: number;
  gets: number;
};

const queue = new Map<string, QueuedToken>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let fetched = false;

function pruneLegacy() {
  if (typeof localStorage === "undefined") return;
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function todayBucket() {
  return Math.floor(Date.now() / DAY_MS);
}

function readBudget(): DailyBudget {
  const today = todayBucket();
  if (typeof localStorage === "undefined") {
    return { day: today, posts: 0, tokens: 0, gets: 0 };
  }
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyBudget;
      if (parsed && parsed.day === today) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { day: today, posts: 0, tokens: 0, gets: 0 };
}

function writeBudget(b: DailyBudget) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(b));
  } catch {
    /* ignore quota */
  }
}

function readCache(): CachedFetch | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(FETCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFetch;
    if (!parsed || !Array.isArray(parsed.tokens)) {
      localStorage.removeItem(FETCH_CACHE_KEY);
      return null;
    }
    if (Date.now() - parsed.at > FETCH_CACHE_TTL_MS) {
      localStorage.removeItem(FETCH_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(FETCH_CACHE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function writeCache(tokens: CachedFetch["tokens"]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      FETCH_CACHE_KEY,
      JSON.stringify({ at: Date.now(), tokens } satisfies CachedFetch),
    );
  } catch {
    /* ignore quota */
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_INTERVAL_MS);
}

async function flushQueue() {
  if (!queue.size) return;
  const budget = readBudget();
  if (budget.posts >= MAX_POSTS_PER_DAY || budget.tokens >= MAX_TOKENS_PER_DAY) {
    queue.clear();
    return;
  }
  const remainingTokens = Math.max(0, MAX_TOKENS_PER_DAY - budget.tokens);
  const batch = Array.from(queue.values()).slice(0, Math.min(20, remainingTokens));
  if (!batch.length) {
    queue.clear();
    return;
  }
  queue.clear();
  // Optimistically reserve budget so a slow round-trip can't double-charge.
  writeBudget({
    ...budget,
    posts: budget.posts + 1,
    tokens: budget.tokens + batch.length,
  });
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.functions.invoke(FUNCTION_NAME, {
      method: "POST",
      body: { tokens: batch },
    });
  } catch (err) {
    // Silent failure — local learning is the source of truth.
    console.warn("goose lexicon sync failed", err);
  }
}

/**
 * Queue tokens parsed from a oneliner for cloud sync. Local learning is
 * still handled by the existing lexicon code.
 */
export function queueOnelinerForCloud(text: string) {
  const budget = readBudget();
  if (budget.posts >= MAX_POSTS_PER_DAY || budget.tokens >= MAX_TOKENS_PER_DAY) {
    return;
  }
  const tokens = tokenizeOneliner(text);
  if (!tokens.length) return;

  for (const token of tokens) {
    if (queue.size >= MAX_QUEUE) break;
    queue.set(token, {
      token,
      category: classifyToken(token),
      flags: [],
    });
  }

  if (queue.size >= FLUSH_QUEUE_LIMIT) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushQueue();
  } else {
    scheduleFlush();
  }
}

/**
 * Fetch the shared lexicon once per session and merge it into the local
 * lexicon. Cached for 1h via localStorage. Hard-capped to a few GETs/day.
 */
export async function hydrateCloudLexiconOnce() {
  if (fetched) return;
  fetched = true;
  pruneLegacy();

  const cached = readCache();
  if (cached) {
    mergeRemote(cached.tokens);
    return;
  }

  const budget = readBudget();
  if (budget.gets >= MAX_GETS_PER_DAY) return;
  writeBudget({ ...budget, gets: budget.gets + 1 });

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      method: "GET",
    });
    if (error) throw error;
    const tokens = (data?.tokens ?? []) as CachedFetch["tokens"];
    writeCache(tokens);
    mergeRemote(tokens);
  } catch (err) {
    console.warn("goose lexicon hydrate failed", err);
  }
}

function mergeRemote(tokens: CachedFetch["tokens"]) {
  const local = new Set(
    getLearnedLexicon().tokens.map((t: LearnedLexiconToken) => t.normalized),
  );
  for (const entry of tokens) {
    if (!entry?.token) continue;
    if (local.has(entry.token.toLowerCase())) continue;
    // Reuse the local learner so sanitization + classification stay consistent.
    learnLexiconFromOneliner(entry.token);
  }
}
