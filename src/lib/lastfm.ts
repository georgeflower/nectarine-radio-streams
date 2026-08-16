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

let cachedApiKey: string | null = null;

/** Fetch the API key from the edge function so the auth URL and the
 *  server-side signed calls can never diverge. Falls back to the
 *  hardcoded publishable constant on any error. */
async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lastfm-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ config: true }),
    });
    const data = await res.json();
    if (typeof data?.apiKey === "string" && data.apiKey.length > 0) {
      cachedApiKey = data.apiKey;
      return cachedApiKey;
    }
  } catch { /* fall through */ }
  cachedApiKey = LASTFM_API_KEY;
  return cachedApiKey;
}

export async function lastfmLoginUrl(): Promise<string> {
  const apiKey = await getApiKey();
  const cb = encodeURIComponent(window.location.origin + window.location.pathname);
  return `https://www.last.fm/api/auth/?api_key=${apiKey}&cb=${cb}`;
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

async function callScrobble(body: Record<string, unknown>, keepalive = false) {
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
      keepalive,
    });
    return await res.json();
  } catch (e) {
    console.warn("[lastfm] call error", e);
    return null;
  }
}

export type LastfmFailureKind = "auth" | "config" | "transient";
export type LastfmCallResult = {
  ok: boolean;
  code?: number;
  message?: string;
  kind?: LastfmFailureKind;
};

/** Last.fm error codes: 4 auth failed, 9 invalid session key,
 *  14 token not authorized, 15 token expired → session unusable.
 *  10 invalid API key, 26 suspended API key → deployment problem. */
const AUTH_CODES = new Set([4, 9, 14, 15]);
const CONFIG_CODES = new Set([10, 26]);

const classify = (code: number | undefined): LastfmFailureKind => {
  if (code !== undefined && AUTH_CODES.has(code)) return "auth";
  if (code !== undefined && CONFIG_CODES.has(code)) return "config";
  return "transient";
};

const resultOf = (data: unknown): LastfmCallResult => {
  if (!data || typeof data !== "object") {
    return { ok: false, kind: "transient", message: "No response from Last.fm" };
  }
  const d = data as Record<string, unknown>;
  if (d.error !== undefined && d.error !== null && d.error !== false && d.error !== "") {
    const n = Number(d.error);
    const code = Number.isFinite(n) ? n : undefined;
    const message =
      typeof d.message === "string" && d.message
        ? d.message
        : typeof d.error === "string"
          ? d.error
          : `Last.fm error ${code ?? "unknown"}`;
    return { ok: false, code, message, kind: classify(code) };
  }
  return { ok: true };
};

export async function sendNowPlaying(
  artist: string,
  track: string,
  duration?: number,
): Promise<LastfmCallResult> {
  if (!current) return { ok: false, kind: "auth", message: "No Last.fm session" };
  const data = await callScrobble({ action: "nowplaying", artist, track, duration });
  return resultOf(data);
}

export async function sendScrobble(
  artist: string,
  track: string,
  timestamp: number,
  duration?: number,
  opts?: { keepalive?: boolean },
): Promise<LastfmCallResult> {
  if (!current) return { ok: false, kind: "auth", message: "No Last.fm session" };
  const data = await callScrobble(
    { action: "scrobble", artist, track, timestamp, duration },
    opts?.keepalive ?? false,
  );
  return resultOf(data);
}


/* ---------------- Activity indicator store ---------------- */

export type LastfmAnnounceState = "idle" | "sending" | "ok" | "failed";
/** Unkeyed: result of the most recent scrobble attempt, whichever track. */
export type LastfmScrobbleState = "idle" | "ok" | "failed";
export type LastfmActivity = {
  songId: string | null;
  announce: LastfmAnnounceState;
  scrobble: LastfmScrobbleState;
};

let activity: LastfmActivity = { songId: null, announce: "idle", scrobble: "idle" };
const activityListeners = new Set<(a: LastfmActivity) => void>();

export const getLastfmActivity = (): LastfmActivity => activity;

export const subscribeLastfmActivity = (cb: (a: LastfmActivity) => void): (() => void) => {
  activityListeners.add(cb);
  return () => { activityListeners.delete(cb); };
};

const emitActivity = () => activityListeners.forEach((l) => l(activity));

export const setLastfmAnnounceState = (songId: string | null, announce: LastfmAnnounceState) => {
  if (songId !== activity.songId) {
    // A new track always starts with "sending"; anything else arriving with a
    // stale songId is a late response and must not rewrite the store.
    if (announce !== "sending") return;
    activity = { ...activity, songId, announce };
  } else {
    activity = { ...activity, announce };
  }
  emitActivity();
};

export const setLastfmScrobbleState = (scrobble: LastfmScrobbleState) => {
  activity = { ...activity, scrobble };
  emitActivity();
};

/* ---------------- Visibility toggle ---------------- */

const VIS_KEY = "nectarine-lastfm-status-visible-v1";
let visible: boolean = (() => {
  try {
    const raw = localStorage.getItem(VIS_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
})();
const visListeners = new Set<(v: boolean) => void>();

export const isLastfmStatusVisible = (): boolean => visible;

export const setLastfmStatusVisible = (v: boolean) => {
  visible = v;
  try { localStorage.setItem(VIS_KEY, String(v)); } catch { /* ignore */ }
  visListeners.forEach((l) => l(v));
};

export const subscribeLastfmStatusVisible = (cb: (v: boolean) => void): (() => void) => {
  visListeners.add(cb);
  return () => { visListeners.delete(cb); };
};



export function useLastfm() {
  const [session, setSession] = useState<LastfmSession | null>(current);
  useEffect(() => {
    const l = () => setSession(current);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const login = useCallback(() => {
    void (async () => {
      window.location.href = await lastfmLoginUrl();
    })();
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
