// Append-only stream telemetry sink. Called via fetch(keepalive) or sendBeacon.
// Writes with the service role key so RLS (read-only for clients) is bypassed.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_EVENTS = new Set([
  "connect_ok",
  "error",
  "stall",
  "ended",
  "recovered",
  "failover",
  "switch",
  "connection_change",
]);

const MAX_EVENTS = 50;

const str = (v: unknown, max = 300): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

const ok = (inserted: number) =>
  new Response(JSON.stringify({ ok: true, inserted }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") return ok(0);

  try {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return ok(0);
    }

    const raw = Array.isArray(payload)
      ? payload
      : (payload as { events?: unknown })?.events;

    if (!Array.isArray(raw)) return ok(0);

    const rows = raw
      .slice(0, MAX_EVENTS)
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .filter((e) =>
        ALLOWED_EVENTS.has(String(e.event)) &&
        typeof e.stream_url === "string" &&
        e.stream_url.length > 0
      )
      .map((e) => ({
        session_id: str(e.session_id, 100) ?? "unknown",
        stream_url: str(e.stream_url, 500)!,
        stream_name: str(e.stream_name, 200),
        bitrate: int(e.bitrate),
        event: String(e.event),
        reason: str(e.reason, 300),
        media_error_code: int(e.media_error_code),
        media_error_message: str(e.media_error_message, 300),
        network_state: int(e.network_state),
        ready_state: int(e.ready_state),
        platform: str(e.platform, 30),
        connection_type: str(e.connection_type, 50),
        effective_type: str(e.effective_type, 50),
        downlink: num(e.downlink),
        ms_since_connection_change: int(e.ms_since_connection_change),
        played_sec: int(e.played_sec),
        hidden: typeof e.hidden === "boolean" ? e.hidden : null,
      }));

    if (rows.length === 0) return ok(0);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { error } = await supabase.from("stream_events").insert(rows);
    if (error) {
      console.error("stream-telemetry insert failed", error.message);
      return ok(0);
    }

    // Probabilistic retention: ~1% of successful inserts prune rows older than
    // 90 days. No pg_cron dependency; volume is low enough that this keeps up.
    if (Math.random() < 0.01) {
      try {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { error: pruneError } = await supabase
          .from("stream_events")
          .delete()
          .lt("created_at", cutoff);
        if (pruneError) console.error("stream-telemetry prune failed", pruneError.message);
      } catch (e) {
        console.error("stream-telemetry prune error", e instanceof Error ? e.message : e);
      }
    }

    return ok(rows.length);
  } catch (e) {
    console.error("stream-telemetry error", e instanceof Error ? e.message : e);
    return ok(0);
  }
});
