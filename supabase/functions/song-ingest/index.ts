// Song metadata sink. The client already fetches song/{id} XML for display;
// this keeps the parts it would otherwise discard. Client-supplied data is
// trusted by design (no second upstream fetch), so validation bounds it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_ARTISTS = 50;
const MAX_GROUPS = 50;
const MAX_TAGS = 100;
const MAX_LINKS = 50;
const ENRICH_TTL_MS = 6 * 60 * 60 * 1000;

// Never persisted, and never allowed to fall through into `extra`.
const EXCLUDED = new Set(["locked", "locked_until", "comments", "comment", "related", "relatedsongs", "related_songs"]);
const MAPPED = new Set([
  "title", "status", "bitrate", "samplerate", "rating", "info", "songlength",
  "lastplayed", "platform", "type", "pouetid", "ytid", "ytoffset",
  "artists", "groups", "tags", "links",
]);

const ok = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Node = unknown;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Containers collapse to a bare value with one child, and to "" when empty.
const arr = (v: unknown): unknown[] => {
  if (v === undefined || v === null || v === "") return [];
  return Array.isArray(v) ? v : [v];
};

// Elements carry attributes only sometimes; without them the node is a string.
const text = (v: Node): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (isObj(v)) {
    const t = v["#text"];
    return typeof t === "string" ? t.trim() : "";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok();

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      console.error("song-ingest payload too large", raw.length);
      return ok();
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw);
    } catch {
      return ok();
    }
    if (!isObj(payload)) return ok();

    const songId = String(payload.song_id ?? "").trim();
    if (!/^\d+$/.test(songId)) return ok();
    const doc = payload.doc;
    if (!isObj(doc)) return ok();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Second line of defence against a chatty client.
    const { data: existing } = await supabase
      .from("songs")
      .select("last_enriched_at")
      .eq("song_id", songId)
      .maybeSingle();
    if (existing?.last_enriched_at) {
      const age = Date.now() - Date.parse(existing.last_enriched_at as string);
      if (Number.isFinite(age) && age < ENRICH_TTL_MS) return ok();
    }

    const title = cut(text(doc.title), 500);
    if (!title) return ok();

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
      votes: isObj(doc.rating) ? (Number.isFinite(Number(doc.rating["@votes"])) ? Math.trunc(Number(doc.rating["@votes"])) : null) : null,
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
      console.error("song-ingest song upsert failed", songErr.message);
      return ok();
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
      // Recon disagreed on the name child tag; accept either spelling.
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
    // A type-16 link is already YouTube; adding the synthetic row would duplicate it.
    if (row.yt_id && !seenSources.has("16") && !seenSources.has("youtube")) {
      const off = row.yt_offset && row.yt_offset > 0 ? `&t=${row.yt_offset}` : "";
      links.push({
        song_id: songId,
        source_id: "youtube",
        source_name: "YouTube",
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(row.yt_id)}${off}`,
      });
    }

    // Delete-then-insert so upstream removals propagate.
    const children: [string, unknown[]][] = [
      ["song_artists", artists],
      ["song_groups", groups],
      ["song_tags", tags],
      ["song_links", links],
    ];
    for (const [table, rows] of children) {
      const { error: delErr } = await supabase.from(table).delete().eq("song_id", songId);
      if (delErr) {
        console.error(`song-ingest delete ${table} failed`, delErr.message);
        continue;
      }
      if (rows.length === 0) continue;
      const { error: insErr } = await supabase.from(table).insert(rows);
      if (insErr) console.error(`song-ingest insert ${table} failed`, insErr.message);
    }

    return ok();
  } catch (e) {
    console.error("song-ingest error", e instanceof Error ? e.message : e);
    return ok();
  }
});
