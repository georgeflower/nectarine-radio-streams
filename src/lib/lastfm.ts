import { useCallback, useEffect, useState } from "react";

const LASTFM_API_KEY = "79ba44ee3d4dd0dff77eedf557b0fd3b"; // publishable
const STORAGE_KEY = "lastfm.session.v1";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type LastfmSession = { sessionKey: string; username: string };

const listeners = new Set<() => void>();
let current: LastfmSession | null = readStored();

function readStored(): LastfmSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getLastfmSession() {
  return current;
}

export function setLastfmSession(s: LastfmSession | null) {
  current = s;
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  emit();
}

export function lastfmLoginUrl(): string {
  const cb = encodeURIComponent(window.location.origin + window.location.pathname);
  return `https://www.last.fm/api/auth/?api_key=${LASTFM_API_KEY}&cb=${cb}`;
}

export type LastfmAuthResult =
  | { ok: true; session: LastfmSession }
  | { ok: false; error: string; details?: unknown };

/** Fire-and-forget diagnostic: verifies the edge function has matching
 *  Last.fm credentials loaded. Returns raw JSON (may include key metadata
 *  such as length + prefix — never full secrets). */
export async function lastfmDiag(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lastfm-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ diag: true }),
    });
    return await res.json();
  } catch (e) {
    return { error: String(e) };
  }
}

/** Client-side metadata for the hardcoded frontend API key. Compare
 *  against `lastfmDiag()` to detect a key-mismatch between the frontend
 *  auth URL and the edge function's signed calls. */
export function frontendKeyMeta() {
  return {
    len: LASTFM_API_KEY.length,
    prefix: LASTFM_API_KEY.slice(0, 4),
    suffix: LASTFM_API_KEY.slice(-4),
  };
}

export async function exchangeToken(token: string): Promise<LastfmAuthResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lastfm-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (data?.sessionKey && data?.username) {
      const session = { sessionKey: data.sessionKey, username: data.username };
      setLastfmSession(session);
      return { ok: true, session };
    }
    const errMsg = typeof data?.error === "string" ? data.error : "Last.fm authorization failed";
    console.warn("[lastfm] auth failed", data);
    return { ok: false, error: errMsg, details: data };
  } catch (e) {
    console.warn("[lastfm] auth error", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function callScrobble(body: Record<string, unknown>) {
  if (!current) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lastfm-scrobble`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ ...body, sessionKey: current.sessionKey }),
    });
    return await res.json();
  } catch (e) {
    console.warn("[lastfm] call error", e);
    return null;
  }
}

export function sendNowPlaying(artist: string, track: string, duration?: number) {
  if (!current) return;
  return callScrobble({ action: "nowplaying", artist, track, duration });
}

export function sendScrobble(artist: string, track: string, timestamp: number, duration?: number) {
  if (!current) return;
  return callScrobble({ action: "scrobble", artist, track, timestamp, duration });
}

export function useLastfm() {
  const [session, setSession] = useState<LastfmSession | null>(current);
  useEffect(() => {
    const l = () => setSession(current);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const login = useCallback(() => {
    window.location.href = lastfmLoginUrl();
  }, []);
  const logout = useCallback(() => setLastfmSession(null), []);
  return { session, login, logout };
}

/** Call once on app mount; if ?token= is present, exchange and clean URL.
 *  Returns a result object so the caller can surface success/failure UI. */
export async function handleLastfmCallback(): Promise<LastfmAuthResult | null> {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) return null;
    const result = await exchangeToken(token);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
