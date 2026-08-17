// Station play-history sink. Every listener reports the same play; the
// (song_id, playstart) unique constraint deduplicates them, so a conflict is
// the expected outcome and must be reported as success.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LENGTH_SEC = 7200;

const ok = (inserted: number) =>
  new Response(JSON.stringify({ ok: true, inserted }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok(0);

  try {
    let payload: Record<string, unknown>;
    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      return ok(0);
    }
    if (!payload || typeof payload !== "object") return ok(0);

    const songId = String(payload.song_id ?? "").trim();
    if (!/^\d+$/.test(songId)) return ok(0);

    // Raw upstream string, kept untouched so Postgres does the single
    // consistent parse for every client regardless of local timezone.
    const playstart = String(payload.playstart ?? "").trim();
    if (!playstart) return ok(0);
    const parsed = Date.parse(playstart.includes("T") ? playstart : playstart.replace(" ", "T") + "Z");
    if (!Number.isFinite(parsed)) return ok(0);
    const skew = parsed - Date.now();
    if (skew > MAX_FUTURE_MS || -skew > MAX_PAST_MS) return ok(0);

    const rawLen = Number(payload.length_sec);
    let lengthSec: number | null = Number.isFinite(rawLen) ? Math.trunc(rawLen) : null;
    if (lengthSec !== null && (lengthSec < 0 || lengthSec > MAX_LENGTH_SEC)) return ok(0);

    let requester: string | null = null;
    if (typeof payload.requester === "string") {
      const r = payload.requester.slice(0, 100).trim();
      requester = r && r !== "-" ? r : null;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase
      .from("song_plays")
      .upsert(
        { song_id: songId, playstart, length_sec: lengthSec, requester },
        { onConflict: "song_id,playstart", ignoreDuplicates: true },
      )
      .select("id");

    if (error) {
      console.error("song-play insert failed", error.message);
      return ok(0);
    }
    return ok(data && data.length > 0 ? 1 : 0);
  } catch (e) {
    console.error("song-play error", e instanceof Error ? e.message : e);
    return ok(0);
  }
});
