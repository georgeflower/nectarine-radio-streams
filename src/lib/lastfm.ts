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

export async function exchangeToken(token: string): Promise<LastfmSession | null> {
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
      return session;
    }
    console.warn("[lastfm] auth failed", data);
    return null;
  } catch (e) {
    console.warn("[lastfm] auth error", e);
    return null;
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

/** Call once on app mount; if ?token= is present, exchange and clean URL. */
export async function handleLastfmCallback() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) return;
    await exchangeToken(token);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  } catch { /* ignore */ }
}
