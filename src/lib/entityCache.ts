// Resolves Nectarine entity IDs (song / artist / group / compilation) to their
// human titles plus a small "meta" subtitle, with in-memory + localStorage caching.
import { fetchEndpoint, parseXml } from "./nectarine";

export type EntityKind = "song" | "artist" | "group" | "compilation";

export interface EntityInfo {
  title: string;
  meta?: string; // e.g. "by Foo Artist", "23 songs", etc.
  rating?: number; // 0–5 average (songs only)
  votes?: number;  // vote count (songs only)
  platformId?: string;   // songs only
  platformName?: string; // songs only
}

type CacheEntry = { info: EntityInfo; fetchedAt: number };
type CacheMap = Record<string, CacheEntry>;

const STORAGE_PREFIX = "nectarine-entity-cache-v3-";
const KINDS: EntityKind[] = ["song", "artist", "group", "compilation"];

// Stale-while-revalidate TTLs. Cached info is shown immediately; a background
// refetch is triggered if the entry is older than this.
const TTL_MS: Record<EntityKind, number> = {
  song: 2 * 60 * 1000,           // ratings/votes change frequently
  artist: 24 * 60 * 60 * 1000,
  group: 24 * 60 * 60 * 1000,
  compilation: 24 * 60 * 60 * 1000,
};

function isStale(kind: EntityKind, fetchedAt: number): boolean {
  return Date.now() - fetchedAt > TTL_MS[kind];
}

const memCache: Record<EntityKind, CacheMap> = {
  song: {}, artist: {}, group: {}, compilation: {},
};
const inflight: Record<EntityKind, Record<string, Promise<EntityInfo>>> = {
  song: {}, artist: {}, group: {}, compilation: {},
};
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  if (typeof localStorage === "undefined") return;
  for (const k of KINDS) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + k);
      if (raw) memCache[k] = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
}

function persist(kind: EntityKind) {
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

// Endpoint path differs from "kind" for compilation (upstream tag is <comp>).
function endpointPath(kind: EntityKind, id: string): string {
  return `${kind}/${id}`;
}

function firstText(root: Element, tag: string): string {
  const el = root.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || "";
}

function countChildren(root: Element, parentTag: string, childTag: string): number {
  const parent = root.getElementsByTagName(parentTag)[0];
  if (!parent) return 0;
  return parent.getElementsByTagName(childTag).length;
}

function extractInfo(kind: EntityKind, xml: Document): EntityInfo {
  const root = xml.documentElement;
  switch (kind) {
    case "song": {
      const title = firstText(root, "title");
      // First artist name = nice subtitle "by X".
      const artists = root.getElementsByTagName("artists")[0];
      const firstArtist = artists?.getElementsByTagName("artist")[0]?.textContent?.trim();
      const length = firstText(root, "songlength");
      // Rating: <rating votes="N">3.0619</rating>
      const ratingEl = root.getElementsByTagName("rating")[0];
      const ratingNum = ratingEl ? parseFloat(ratingEl.textContent || "") : NaN;
      const votesNum = ratingEl ? parseInt(ratingEl.getAttribute("votes") || "", 10) : NaN;
      const parts: string[] = [];
      if (firstArtist) parts.push(`by ${firstArtist}`);
      if (length) {
        const sec = parseInt(length, 10);
        if (Number.isFinite(sec) && sec > 0) {
          const m = Math.floor(sec / 60);
          const s = String(sec % 60).padStart(2, "0");
          parts.push(`${m}:${s}`);
        }
      }
      if (Number.isFinite(ratingNum)) {
        parts.push(`★ ${ratingNum.toFixed(2)}${Number.isFinite(votesNum) ? ` (${votesNum})` : ""}`);
      }
      const platformEl = root.getElementsByTagName("platform")[0];
      const platformId = platformEl?.getAttribute("id") || "";
      const platformName = platformEl?.textContent?.trim() || "";
      return {
        title,
        meta: parts.join(" · ") || undefined,
        rating: Number.isFinite(ratingNum) ? ratingNum : undefined,
        votes: Number.isFinite(votesNum) ? votesNum : undefined,
        platformId: platformId || undefined,
        platformName: platformName || undefined,
      };
    }
    case "artist": {
      const title = firstText(root, "handle") || firstText(root, "name");
      const songCount = countChildren(root, "songs", "song");
      const country = firstText(root, "country");
      const parts: string[] = [];
      if (songCount) parts.push(`${songCount} song${songCount === 1 ? "" : "s"}`);
      if (country) parts.push(country.toUpperCase());
      return { title, meta: parts.join(" · ") || undefined };
    }
    case "group": {
      const title = firstText(root, "name");
      const memberCount = countChildren(root, "active_group_members", "artist");
      const songCount = countChildren(root, "active_group_songs", "song");
      const parts: string[] = [];
      if (memberCount) parts.push(`${memberCount} member${memberCount === 1 ? "" : "s"}`);
      if (songCount) parts.push(`${songCount} song${songCount === 1 ? "" : "s"}`);
      return { title, meta: parts.join(" · ") || undefined };
    }
    case "compilation": {
      const title = firstText(root, "title");
      const label = firstText(root, "label");
      const date = firstText(root, "release_date");
      const parts: string[] = [];
      if (label) parts.push(label);
      if (date) parts.push(date);
      return { title, meta: parts.join(" · ") || undefined };
    }
  }
}

async function resolveOne(kind: EntityKind, id: string): Promise<EntityInfo> {
  load();
  if (memCache[kind][id]) return memCache[kind][id];
  if (inflight[kind][id]) return inflight[kind][id];
  const p = (async () => {
    try {
      const text = await fetchEndpoint(endpointPath(kind, id));
      const doc = parseXml(text);
      const info = extractInfo(kind, doc);
      if (info.title) {
        memCache[kind][id] = info;
        persist(kind);
        notify();
      }
      return info;
    } catch {
      return { title: "" };
    } finally {
      delete inflight[kind][id];
    }
  })();
  inflight[kind][id] = p;
  return p;
}

export function getCachedInfo(kind: EntityKind, id: string): EntityInfo | undefined {
  load();
  return memCache[kind][id];
}

export function getCachedTitle(kind: EntityKind, id: string): string | undefined {
  return getCachedInfo(kind, id)?.title;
}

export function requestInfo(kind: EntityKind, id: string): void {
  if (!id) return;
  load();
  if (memCache[kind][id] || inflight[kind][id]) return;
  void resolveOne(kind, id);
}

// Back-compat alias.
export const requestTitle = requestInfo;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
