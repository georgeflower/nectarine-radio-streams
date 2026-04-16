// Resolves Nectarine song/artist IDs to their human titles, with in-memory + localStorage caching.
import { fetchEndpoint, parseXml } from "./nectarine";

type Kind = "song" | "artist";
type CacheMap = Record<string, string>;

const STORAGE_PREFIX = "nectarine-entity-cache-";
const memCache: Record<Kind, CacheMap> = { song: {}, artist: {} };
const inflight: Record<Kind, Record<string, Promise<string>>> = { song: {}, artist: {} };
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  if (typeof localStorage === "undefined") return;
  for (const k of ["song", "artist"] as Kind[]) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + k);
      if (raw) memCache[k] = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
}

function persist(kind: Kind) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + kind, JSON.stringify(memCache[kind]));
  } catch {
    /* ignore quota */
  }
}

function notify() {
  for (const fn of listeners) fn();
}

function extractTitle(kind: Kind, xml: Document): string {
  const root = xml.documentElement;
  // Try common tag names first.
  const candidates =
    kind === "song"
      ? ["title", "name", "song"]
      : ["name", "handle", "title", "artist"];
  for (const tag of candidates) {
    const el = root.getElementsByTagName(tag)[0];
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  // Fallback to a name attribute on root.
  return root.getAttribute("name")?.trim() || "";
}

async function resolveOne(kind: Kind, id: string): Promise<string> {
  load();
  if (memCache[kind][id]) return memCache[kind][id];
  if (inflight[kind][id]) return inflight[kind][id];
  const p = (async () => {
    try {
      const text = await fetchEndpoint(`${kind}/${id}`);
      const doc = parseXml(text);
      const title = extractTitle(kind, doc);
      if (title) {
        memCache[kind][id] = title;
        persist(kind);
        notify();
      }
      return title;
    } catch {
      return "";
    } finally {
      delete inflight[kind][id];
    }
  })();
  inflight[kind][id] = p;
  return p;
}

export function getCachedTitle(kind: Kind, id: string): string | undefined {
  load();
  return memCache[kind][id];
}

export function requestTitle(kind: Kind, id: string): void {
  if (!id) return;
  load();
  if (memCache[kind][id] || inflight[kind][id]) return;
  void resolveOne(kind, id);
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
