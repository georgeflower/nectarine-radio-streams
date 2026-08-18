// Resolves Nectarine entity IDs (song / artist / group / compilation) to their
// human titles plus a small "meta" subtitle, with in-memory + localStorage caching.
import { fetchEndpoint, parseXml, xmlNodeToObject } from "./nectarine";
import { ingestSong } from "./songLog";
import { supabase } from "@/integrations/supabase/client";

export type EntityKind = "song" | "artist" | "group" | "compilation";

export interface EntityInfo {
  title: string;
  meta?: string; // e.g. "by Foo Artist", "23 songs", etc.
  rating?: number; // 0–5 average (songs only)
  votes?: number; // vote count (songs only)
  platformId?: string; // songs only
  platformName?: string; // songs only
  tags?: string[];
  links?: { sourceId: string; sourceName: string | null; url: string }[];
}

type CacheEntry = { info: EntityInfo; fetchedAt: number };
type CacheMap = Record<string, CacheEntry>;

const STORAGE_PREFIX = "nectarine-entity-cache-v4-";
const KINDS: EntityKind[] = ["song", "artist", "group", "compilation"];

// How long a DB row counts as fresh enough to serve without re-fetching upstream.
const DB_FRESH_MS = 6 * 60 * 60 * 1000;

// Stale-while-revalidate TTLs. Cached info is shown immediately; a background
// refetch is triggered if the entry is older than this.
const TTL_MS: Record<EntityKind, number> = {
  song: 30 * 60 * 1000,
  artist: 24 * 60 * 60 * 1000,
  group: 24 * 60 * 60 * 1000,
  compilation: 24 * 60 * 60 * 1000,
};

function isStale(kind: EntityKind, fetchedAt: number): boolean {
  return Date.now() - fetchedAt > TTL_MS[kind];
}

const memCache: Record<EntityKind, CacheMap> = {
  song: {},
  artist: {},
  group: {},
  compilation: {},
};
const inflight: Record<EntityKind, Record<string, Promise<EntityInfo>>> = {
  song: {},
  artist: {},
  group: {},
  compilation: {},
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

const MAX_ENTRIES = 500;

function evict(kind: EntityKind) {
  const map = memCache[kind];
  const keys = Object.keys(map);
  if (keys.length <= MAX_ENTRIES) return;
  keys
    .sort((a, b) => (map[a]?.fetchedAt ?? 0) - (map[b]?.fetchedAt ?? 0))
    .slice(0, keys.length - MAX_ENTRIES)
    .forEach((k) => delete map[k]);
}

function persist(kind: EntityKind) {
  evict(kind);
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

// Shared formatting so DB-resolved and XML-resolved songs render identically.
function formatLength(sec: number): string | undefined {
  if (!Number.isFinite(sec) || sec <= 0) return undefined;
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function formatRating(rating: number, votes: number): string | undefined {
  if (!Number.isFinite(rating)) return undefined;
  return `★ ${rating.toFixed(2)}${Number.isFinite(votes) ? ` (${votes})` : ""}`;
}

function buildSongMeta(
  firstArtist: string | undefined,
  lengthSec: number,
  rating: number,
  votes: number,
): string | undefined {
  const parts: string[] = [];
  if (firstArtist) parts.push(`by ${firstArtist}`);
  const len = formatLength(lengthSec);
  if (len) parts.push(len);
  const rat = formatRating(rating, votes);
  if (rat) parts.push(rat);
  return parts.join(" · ") || undefined;
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
      const platformEl = root.getElementsByTagName("platform")[0];
      const platformId = platformEl?.getAttribute("id") || "";
      const platformName = platformEl?.textContent?.trim() || "";

      const tagsParent = root.getElementsByTagName("tags")[0];
      const tags = tagsParent
        ? Array.from(tagsParent.getElementsByTagName("tag"))
            .map((t) => t.textContent?.trim() || "")
            .filter(Boolean)
        : [];

      const linksParent = root.getElementsByTagName("links")[0];
      const links = linksParent
        ? Array.from(linksParent.getElementsByTagName("link"))
            .map((l) => {
              const typeEl = l.getElementsByTagName("type")[0];
              const sourceId = typeEl?.getAttribute("id") || "";
              const nameEl = l.getElementsByTagName("n")[0] || l.getElementsByTagName("name")[0];
              const sourceName = nameEl?.textContent?.trim() || null;
              const url = l.getElementsByTagName("url")[0]?.textContent?.trim() || "";
              return { sourceId, sourceName, url };
            })
            .filter((l) => !!l.url)
        : [];

      return {
        title,
        meta: buildSongMeta(firstArtist, parseInt(length, 10), ratingNum, votesNum),
        rating: Number.isFinite(ratingNum) ? ratingNum : undefined,
        votes: Number.isFinite(votesNum) ? votesNum : undefined,
        platformId: platformId || undefined,
        platformName: platformName || undefined,
        tags: tags.length ? tags : undefined,
        links: links.length ? links : undefined,
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

type SongRow = {
  title: string | null;
  rating: number | string | null;
  votes: number | null;
  length_sec: number | null;
  platform_id: string | null;
  platform_name: string | null;
  last_enriched_at: string;
  song_artists?: { artist_name: string | null; position: number | null }[] | null;
  song_tags?: { tag: string | null }[] | null;
  song_links?: { source_id: string; source_name: string | null; url: string | null }[] | null;
};

function infoFromRow(row: SongRow): EntityInfo {
  const artists = [...(row.song_artists ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const firstArtist = artists[0]?.artist_name?.trim() || undefined;
  const ratingNum = row.rating === null || row.rating === undefined ? NaN : Number(row.rating);
  const votesNum = row.votes === null || row.votes === undefined ? NaN : Number(row.votes);
  const tags = (row.song_tags ?? []).map((t) => t.tag?.trim() || "").filter(Boolean);
  const links = (row.song_links ?? [])
    .filter((l) => !!l.url)
    .map((l) => ({ sourceId: l.source_id, sourceName: l.source_name, url: l.url as string }));
  return {
    title: row.title || "",
    meta: buildSongMeta(firstArtist, Number(row.length_sec), ratingNum, votesNum),
    rating: Number.isFinite(ratingNum) ? ratingNum : undefined,
    votes: Number.isFinite(votesNum) ? votesNum : undefined,
    platformId: row.platform_id || undefined,
    platformName: row.platform_name || undefined,
    tags: tags.length ? tags : undefined,
    links: links.length ? links : undefined,
  };
}

async function resolveOne(kind: EntityKind, id: string): Promise<EntityInfo> {
  load();
  if (inflight[kind][id]) return inflight[kind][id];
  const p = (async () => {
    try {
      if (kind === "song") {
        // DB-first: a freshly enriched row spares an upstream XML fetch.
        try {
          const { data } = await supabase
            .from("songs")
            .select(
              "title, rating, votes, length_sec, platform_id, platform_name, last_enriched_at, song_artists(artist_name, position), song_tags(tag), song_links(source_id, source_name, url)",
            )
            .eq("song_id", id)
            .maybeSingle();
          const row = data as SongRow | null;
          if (row && Date.now() - Date.parse(row.last_enriched_at) < DB_FRESH_MS) {
            const dbInfo = infoFromRow(row);
            if (dbInfo.title) {
              memCache[kind][id] = { info: dbInfo, fetchedAt: Date.now() };
              persist(kind);
              notify();
              return dbInfo;
            }
          }
        } catch {
          /* DB is an optimisation only — fall through upstream */
        }
      }
      const text = await fetchEndpoint(endpointPath(kind, id));

      const doc = parseXml(text);
      const info = extractInfo(kind, doc);
      if (kind === "song" && info.title) {
        // Keep the document we already fetched; never block or break resolve.
        try {
          ingestSong(id, xmlNodeToObject(doc.documentElement));
        } catch {
          /* ignore */
        }
      }
      if (info.title) {
        memCache[kind][id] = { info, fetchedAt: Date.now() };
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
  return memCache[kind][id]?.info;
}

export function getCachedTitle(kind: EntityKind, id: string): string | undefined {
  return getCachedInfo(kind, id)?.title;
}

export function requestInfo(kind: EntityKind, id: string): void {
  if (!id) return;
  load();
  if (inflight[kind][id]) return;
  const entry = memCache[kind][id];
  if (entry && !isStale(kind, entry.fetchedAt)) return;
  void resolveOne(kind, id);
}

// Back-compat alias.
export const requestTitle = requestInfo;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
