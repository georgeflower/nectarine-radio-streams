// Tiny local counter for user actions that otherwise only reach Last.fm.
// Fire-and-forget: never blocks or breaks the caller.
import { createClient } from "npm:@supabase/supabase-js@2";

export type AppEvent = "love" | "unlove" | "lastfm_login";

async function sha256Short(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function recordAppEvent(entry: { event: AppEvent; songId?: string | null; sessionKey?: string | null }): void {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const work = (async () => {
      const session_hash = entry.sessionKey ? await sha256Short(entry.sessionKey) : null;
      const song_id = entry.songId && /^\d+$/.test(String(entry.songId)) ? String(entry.songId) : null;
      const { error } = await supabase.from("app_events").insert({ event: entry.event, song_id, session_hash });
      if (error) console.error("app_events insert failed", error.message);
    })();
    const waiter = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (waiter?.waitUntil) waiter.waitUntil(work);
    else void work.catch(() => {});
  } catch (e) {
    console.error("app_events error", e instanceof Error ? e.message : e);
  }
}
