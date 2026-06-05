// Cloud-shared goose lexicon sync.
//
// Strategy (designed to stay inside the Lovable Cloud free tier):
//  - Local writes still happen in `gooseLearnedLexicon.ts` (no behaviour change).
//  - New tokens are queued in memory and flushed in batches (max once / 60s,
//    or when the queue reaches 10 tokens) via a single edge function POST.
//  - A single GET runs once per session (cached for 1h in localStorage) and
//    merges remote tokens into the local store so geese benefit from what
//    other listeners' birds have learned.
//
// No realtime, no per-keystroke writes, no large payloads.

import { supabase } from "@/integrations/supabase/client";
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
const FETCH_CACHE_KEY = "goose-lexicon-cloud-cache-v1";
const FETCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_QUEUE = 60;

type QueuedToken = {
  token: string;
  category: string;
  flags: string[];
};

type CachedFetch = {
  at: number;
  tokens: Array<{ token: string; category?: string }>;
};

const queue = new Map<string, QueuedToken>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let fetched = false;

function readCache(): CachedFetch | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(FETCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFetch;
    if (!parsed || !Array.isArray(parsed.tokens)) return null;
    if (Date.now() - parsed.at > FETCH_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
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
  const batch = Array.from(queue.values()).slice(0, 20);
  queue.clear();
  try {
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
 * lexicon. Cached for 1h via localStorage to avoid repeat calls.
 */
export async function hydrateCloudLexiconOnce() {
  if (fetched) return;
  fetched = true;

  const cached = readCache();
  if (cached) {
    mergeRemote(cached.tokens);
    return;
  }

  try {
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
