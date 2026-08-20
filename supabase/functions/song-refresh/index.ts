// Server-side freshness authority for song rows. Clients ask for a song; this
// decides whether the stored row is fresh enough, and — when it is not — takes
// a short-lived claim so concurrent listeners collapse to one upstream fetch.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";
import { logUpstream, type UpstreamOutcome } from "../_shared/upstreamLedger.ts";

const ledger = (outcome: UpstreamOutcome, songId: string) =>
  logUpstream({ endpoint: "song", entityId: songId, outcome, source: "song-refresh" });


const TTL_NOW_MS = 45 * 60 * 1000;
const TTL_BACKGROUND_MS = 6 * 60 * 60 * 1000;
const CLAIM_WINDOW_MS = 60 * 1000;

const MAX_ARTISTS = 50;
const MAX_GROUPS = 50;
const MAX_TAGS = 100;
const MAX_LINKS = 50;

const EXCLUDED = new Set(["locked", "locked_until", "comments", "comment", "related", "relatedsongs", "related_songs"]);
const MAPPED = new Set([
  "title", "status", "bitrate", "samplerate", "rating", "info", "songlength",
  "lastplayed", "platform", "type", "pouetid", "ytid", "ytoffset",
  "artists", "groups", "tags", "links",
]);

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Node = unknown;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const arr = (v: unknown): unknown[] => {
  if (v === undefined || v === null || v === "") return [];
  return Array.isArray(v) ? v : [v];
};

const text = (v: Node): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (isObj(v)) {
    const t = v["#text"];
    return typeof t === "string" ? t.trim() : typeof t === "number" ? String(t) : "";
  }
  return "";
};
const attrOf = (v: Node, name: string): string => (isObj(v) ? String(v[`@${name}`] ?? "").trim() : "");
const cut = (s: string, n: number): string | null => (s ? s.slice(0, n) : null);
const num = (v: Node): number | null => {
  const n = Number(text(v));
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const dec = (v: Node): number | null => {
  const n = Number(text(v));
  return Number.isFinite(n) ? n : null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const SELECT =
  "song_id, title, rating, votes, length_sec, platform_id, platform_name, last_enriched_at, " +
  "song_artists(artist_name, artist_id, position), song_tags(tag), song_links(source_id, source_name, url)";

// deno-lint-ignore no-explicit-any
async function readSong(supabase: any, songId: string) {
  const { data } = await supabase.from("songs").select(SELECT).eq("song_id", songId).maybeSingle();
  if (!data) return null;
  const { data: lp } = await supabase
    .from("song_last_played")
    .select("last_played_locally")
    .eq("song_id", songId)
    .maybeSingle();
  return { ...data, last_played_locally: lp?.last_played_locally ?? null };
}

async function fetchDoc(songId: string): Promise<Record<string, unknown> | null> {
  const resp = await fetch(`https://scenestream.net/demovibes/xml/song/${songId}/`, {
    headers: { Accept: "application/xml,text/xml,*/*" },
  });
  if (!resp.ok) {
    console.error("song-refresh upstream status", resp.status);
    return null;
  }
  const body = await resp.text();
  const parsed = parser.parse(body);
  if (!isObj(parsed)) return null;
  const root = parsed.song ?? Object.values(parsed).find((v) => isObj(v));
  return isObj(root) ? root : null;
}

// deno-lint-ignore no-explicit-any
async function ingest(supabase: any, songId: string, doc: Record<string, unknown>): Promise<boolean> {
  const title = cut(text(doc.title), 500);
  if (!title) return false;

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith("@") || k === "#text") continue;
    if (MAPPED.has(k) || EXCLUDED.has(k)) continue;
    extra[k] = v;
  }

  const lastplayedRaw = text(doc.lastplayed);
  const lastplayed = lastplayedRaw && Number.isFinite(Date.parse(lastplayedRaw.replace(" ", "T")))
    ? lastplayedRaw
    : null;

  const row = {
    song_id: songId,
    title,
    status_text: cut(text(doc.status), 100),
    status_v: cut(attrOf(doc.status, "v"), 20),
    bitrate: num(doc.bitrate),
    samplerate: num(doc.samplerate),
    rating: dec(doc.rating),
    votes: isObj(doc.rating) && Number.isFinite(Number(doc.rating["@votes"]))
      ? Math.trunc(Number(doc.rating["@votes"]))
      : null,
    info: cut(text(doc.info), 20000),
    length_sec: num(doc.songlength),
    lastplayed,
    platform_id: cut(attrOf(doc.platform, "id"), 50),
    platform_name: cut(text(doc.platform), 200),
    type_id: cut(attrOf(doc.type, "id"), 50),
    type_name: cut(text(doc.type), 200),
    pouet_id: cut(text(doc.pouetid), 50),
    yt_id: cut(text(doc.ytid), 50),
    yt_offset: num(doc.ytoffset),
    extra,
    last_enriched_at: new Date().toISOString(),
  };

  const { error: songErr } = await supabase.from("songs").upsert(row, { onConflict: "song_id" });
  if (songErr) {
    console.error("song-refresh song upsert failed", songErr.message);
    return false;
  }

  const artistsSrc = isObj(doc.artists) ? arr(doc.artists.artist) : [];
  const artists = artistsSrc.slice(0, MAX_ARTISTS).map((a, i) => ({
    song_id: songId,
    artist_id: attrOf(a, "id") || text(a),
    artist_name: cut(text(a), 300),
    position: i,
  })).filter((a) => a.artist_id);

  const groupsSrc = isObj(doc.groups) ? arr(doc.groups.group) : [];
  const groups = groupsSrc.slice(0, MAX_GROUPS).map((g) => ({
    song_id: songId,
    group_id: attrOf(g, "id") || text(g),
    group_name: cut(text(g), 300),
  })).filter((g) => g.group_id);

  const tagsSrc = isObj(doc.tags) ? arr(doc.tags.tag) : [];
  const seenTags = new Set<string>();
  const tags: { song_id: string; tag: string }[] = [];
  for (const t of tagsSrc.slice(0, MAX_TAGS)) {
    const tag = text(t).slice(0, 200);
    if (!tag) continue;
    const norm = tag.toLowerCase();
    if (seenTags.has(norm)) continue;
    seenTags.add(norm);
    tags.push({ song_id: songId, tag });
  }

  const linksSrc = isObj(doc.links) ? arr(doc.links.link) : [];
  const links: { song_id: string; source_id: string; source_name: string | null; url: string | null }[] = [];
  const seenSources = new Set<string>();
  for (const l of linksSrc.slice(0, MAX_LINKS)) {
    if (!isObj(l)) continue;
    const t = l.type;
    const sourceId = attrOf(t, "id");
    if (!sourceId) continue;
    const sourceName = isObj(t) ? text(t.name) || text(t.n) || null : null;
    const url = cut(text(l.url), 2000);
    if (seenSources.has(sourceId)) continue;
    seenSources.add(sourceId);
    links.push({ song_id: songId, source_id: sourceId, source_name: sourceName ? sourceName.slice(0, 200) : null, url });
  }

  if (row.pouet_id && /^\d+$/.test(row.pouet_id) && !seenSources.has("pouet")) {
    seenSources.add("pouet");
    links.push({
      song_id: songId,
      source_id: "pouet",
      source_name: "Pouet",
      url: `https://www.pouet.net/prod.php?which=${row.pouet_id}`,
    });
  }
  if (row.yt_id && !seenSources.has("16") && !seenSources.has("youtube")) {
    const off = row.yt_offset && row.yt_offset > 0 ? `&t=${row.yt_offset}` : "";
    links.push({
      song_id: songId,
      source_id: "youtube",
      source_name: "YouTube",
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(row.yt_id)}${off}`,
    });
  }

  const children: [string, unknown[]][] = [
    ["song_artists", artists],
    ["song_groups", groups],
    ["song_tags", tags],
    ["song_links", links],
  ];
  for (const [table, rows] of children) {
    const { error: delErr } = await supabase.from(table).delete().eq("song_id", songId);
    if (delErr) {
      console.error(`song-refresh delete ${table} failed`, delErr.message);
      continue;
    }
    if (rows.length === 0) continue;
    const { error: insErr } = await supabase.from(table).insert(rows);
    if (insErr) console.error(`song-refresh insert ${table} failed`, insErr.message);
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false });

  try {
    let payload: Record<string, unknown>;
    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false });
    }
    if (!isObj(payload)) return json({ ok: false });

    const songId = String(payload.song_id ?? "").trim();
    if (!/^\d+$/.test(songId)) return json({ ok: false });
    const priority = payload.priority === "now" ? "now" : "background";
    const ttl = priority === "now" ? TTL_NOW_MS : TTL_BACKGROUND_MS;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const existing = await readSong(supabase, songId);

    if (!existing) {
      const doc = await fetchDoc(songId);
      if (!doc || !(await ingest(supabase, songId, doc))) return json({ ok: false });
      return json({ ok: true, song: await readSong(supabase, songId), source: "fetched" });
    }

    const age = Date.now() - Date.parse(existing.last_enriched_at as string);
    if (Number.isFinite(age) && age < ttl) {
      return json({ ok: true, song: existing, source: "cache" });
    }

    const { data: claimRow } = await supabase
      .from("songs")
      .select("refresh_claimed_at")
      .eq("song_id", songId)
      .maybeSingle();
    const claimedAt = claimRow?.refresh_claimed_at ? Date.parse(claimRow.refresh_claimed_at) : NaN;
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < CLAIM_WINDOW_MS) {
      return json({ ok: true, song: existing, source: "claimed-by-other" });
    }

    await supabase.from("songs").update({ refresh_claimed_at: new Date().toISOString() }).eq("song_id", songId);

    const doc = await fetchDoc(songId);
    if (!doc || !(await ingest(supabase, songId, doc))) {
      return json({ ok: true, song: existing, source: "cache" });
    }
    return json({ ok: true, song: await readSong(supabase, songId), source: "refreshed" });
  } catch (e) {
    console.error("song-refresh error", e instanceof Error ? e.message : e);
    return json({ ok: false });
  }
});
