// Lightweight cloud sync for the geese's learned lexicon.
// - GET  -> returns the top ~500 tokens by recency + frequency.
// - POST -> accepts up to 20 sanitized tokens per call and upserts them.
// Designed to stay inside the Lovable Cloud free tier: tiny rows, batched
// writes, single GET per session (the client caches the result).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MAX_TOKENS_PER_CALL = 20;
const MAX_TOKEN_LEN = 32;
const TOP_TOKEN_LIMIT = 500;
const CLEANUP_PROBABILITY = 0.01;

const SENSITIVE_RE =
  /(https?:\/\/|www\.|\b\S+@\S+\.\S+\b|\b\d{8,}\b|\b(?:token|password|passwd|secret|apikey|api[-_ ]?key|bearer)\b)/i;

const ALLOWED_CATEGORIES = new Set([
  "greeting",
  "laughter",
  "wink",
  "heart",
  "hype",
  "farewell",
  "slang",
  "emphasis",
  "neutral",
]);

const ALLOWED_FLAGS = new Set([
  "all-caps",
  "emoticon",
  "punct-heavy",
  "elongated",
]);

type IncomingToken = {
  token: string;
  category?: string;
  flags?: string[];
};

function sanitize(input: unknown): {
  token: string;
  category: string;
  style_flags: string[];
} | null {
  if (!input || typeof input !== "object") return null;
  const t = (input as IncomingToken).token;
  if (typeof t !== "string") return null;
  const token = t.trim();
  if (token.length < 2 || token.length > MAX_TOKEN_LEN) return null;
  if (SENSITIVE_RE.test(token)) return null;
  if (!/[a-z<:;!?.]/i.test(token)) return null;
  if (/\d{5,}/.test(token)) return null;

  const rawCategory = (input as IncomingToken).category;
  const category =
    typeof rawCategory === "string" && ALLOWED_CATEGORIES.has(rawCategory)
      ? rawCategory
      : "neutral";

  const rawFlags = (input as IncomingToken).flags;
  const style_flags = Array.isArray(rawFlags)
    ? rawFlags
        .filter((f): f is string => typeof f === "string" && ALLOWED_FLAGS.has(f))
        .slice(0, 4)
    : [];

  return { token, category, style_flags };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("goose_lexicon")
        .select("token, category, seen, last_seen_at, style_flags")
        .order("last_seen_at", { ascending: false })
        .limit(TOP_TOKEN_LIMIT);

      if (error) throw error;
      return new Response(JSON.stringify({ tokens: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.tokens)) {
        return new Response(JSON.stringify({ error: "invalid body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleaned = body.tokens
        .slice(0, MAX_TOKENS_PER_CALL)
        .map(sanitize)
        .filter((x): x is { token: string; category: string; style_flags: string[] } => !!x);

      if (!cleaned.length) {
        return new Response(JSON.stringify({ accepted: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert one row at a time so we can increment `seen` server-side.
      // Volumes are tiny (≤ 20 per call) so this stays within free tier.
      for (const entry of cleaned) {
        const { data: existing } = await supabase
          .from("goose_lexicon")
          .select("seen, style_flags")
          .eq("token", entry.token)
          .maybeSingle();

        if (existing) {
          const mergedFlags = Array.from(
            new Set([...(existing.style_flags ?? []), ...entry.style_flags]),
          );
          await supabase
            .from("goose_lexicon")
            .update({
              seen: (existing.seen ?? 1) + 1,
              last_seen_at: new Date().toISOString(),
              category: entry.category,
              style_flags: mergedFlags,
            })
            .eq("token", entry.token);
        } else {
          await supabase.from("goose_lexicon").insert({
            token: entry.token,
            category: entry.category,
            style_flags: entry.style_flags,
          });
        }
      }

      // Occasional cleanup keeps the table small without needing a cron job.
      if (Math.random() < CLEANUP_PROBABILITY) {
        const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from("goose_lexicon")
          .delete()
          .lt("last_seen_at", cutoff)
          .lt("seen", 2);
      }

      return new Response(JSON.stringify({ accepted: cleaned.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("goose-lexicon-sync error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
