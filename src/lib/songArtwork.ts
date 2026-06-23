// Resolves a song's screenshot / platform-icon URL via the `song-artwork`
// edge function and caches results in memory + localStorage. Used to populate
// the OS lockscreen / notification artwork (navigator.mediaSession).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/song-artwork`;
const STORAGE_KEY = "song-artwork-cache-v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface SongArtwork {
  screenshotUrl?: string;
  platformIconUrl?: string;
}

type Entry = { info: SongArtwork; fetchedAt: number };
type CacheMap = Record<string, Entry>;

const memCache: CacheMap = {};
const inflight: Record<string, Promise<SongArtwork>> = {};
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(memCache, JSON.parse(raw) as CacheMap);
  } catch {
    /* ignore */
  }
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memCache));
  } catch {
    /* ignore quota */
  }
}

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

function isStale(entry: Entry): boolean {
  return Date.now() - entry.fetchedAt > TTL_MS;
}

export function getCachedSongArtwork(songId: string | undefined | null): SongArtwork | undefined {
  if (!songId) return undefined;
  load();
  return memCache[songId]?.info;
}

export function getBestArtworkUrl(songId: string | undefined | null): string | undefined {
  const info = getCachedSongArtwork(songId);
  if (!info) return undefined;
  return info.screenshotUrl || info.platformIconUrl || undefined;
}

async function resolveOne(songId: string): Promise<SongArtwork> {
  if (inflight[songId]) return inflight[songId];
  const p = (async () => {
    try {
      const r = await fetch(`${ENDPOINT}?songId=${encodeURIComponent(songId)}`, {
        cache: "no-store",
      });
      if (!r.ok) return {};
      const json = (await r.json()) as SongArtwork;
      const info: SongArtwork = {
        screenshotUrl: json.screenshotUrl,
        platformIconUrl: json.platformIconUrl,
      };
      memCache[songId] = { info, fetchedAt: Date.now() };
      persist();
      notify();
      return info;
    } catch {
      return {};
    } finally {
      delete inflight[songId];
    }
  })();
  inflight[songId] = p;
  return p;
}

export function requestSongArtwork(songId: string | undefined | null): void {
  if (!songId) return;
  load();
  if (inflight[songId]) return;
  const entry = memCache[songId];
  if (entry && !isStale(entry)) return;
  void resolveOne(songId);
}

export function subscribeSongArtwork(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Test-only helper.
export function __resetSongArtworkCacheForTests() {
  for (const k of Object.keys(memCache)) delete memCache[k];
  for (const k of Object.keys(inflight)) delete inflight[k];
  listeners.clear();
  loaded = false;
}
