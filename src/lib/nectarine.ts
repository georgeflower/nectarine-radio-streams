// Nectarine demoscene radio API client.
// All requests routed through the `xml-proxy` edge function to bypass CORS.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/xml-proxy`;

export const ENDPOINTS = ["queue", "oneliner", "online", "streams"] as const;
export type Endpoint = (typeof ENDPOINTS)[number];

export const AUTO_REFRESH_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ONELINERS = 12;
const MAX_QUEUE = 5;
const MAX_HISTORY = 5;

export function toTitle(endpoint: string) {
  return endpoint.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function fetchWithTimeout(url: string) {
  const ctrl = new AbortController();
  const id = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    window.clearTimeout(id);
  }
}

export async function fetchEndpoint(path: string): Promise<string> {
  const url = `${PROXY_URL}?path=${encodeURIComponent(path)}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export function parseXml(text: string) {
  return new DOMParser().parseFromString(text, "application/xml");
}

// ─── Pretty printer (XML → JSON-ish) ───────────────────────────────────────────
function xmlNodeToObject(node: Element): unknown {
  const hasEl = Array.from(node.childNodes).some((c) => c.nodeType === Node.ELEMENT_NODE);
  const attrs: Record<string, string> = {};
  for (const a of Array.from(node.attributes)) attrs[`@${a.name}`] = a.value;
  if (!hasEl) {
    const text = node.textContent?.trim() ?? "";
    if (Object.keys(attrs).length === 0) return text;
    return { ...attrs, ...(text ? { "#text": text } : {}) };
  }
  const result: Record<string, unknown> = { ...attrs };
  for (const child of Array.from(node.children)) {
    const parsed = xmlNodeToObject(child);
    if (Object.prototype.hasOwnProperty.call(result, child.tagName)) {
      if (!Array.isArray(result[child.tagName])) result[child.tagName] = [result[child.tagName]];
      (result[child.tagName] as unknown[]).push(parsed);
    } else {
      result[child.tagName] = parsed;
    }
  }
  return result;
}

export function xmlToPretty(xml: Document) {
  const root = xml.documentElement;
  return JSON.stringify({ [root.tagName]: xmlNodeToObject(root) }, null, 2);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function txt(el: Element | null | undefined, tag: string): string {
  if (!el) return "";
  const c = el.getElementsByTagName(tag)[0];
  return c?.textContent?.trim() ?? "";
}

function attr(el: Element | null | undefined, tag: string, name: string): string {
  if (!el) return "";
  const c = el.getElementsByTagName(tag)[0];
  return c?.getAttribute(name) ?? "";
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export type QueueEntry = {
  artist: string;
  artistId: string;
  song: string;
  songId: string;
  lengthSec: number;
  requester: string;
  playstart: string; // ISO-ish
};

export type PlaylistData = {
  now: QueueEntry | null;
  queue: QueueEntry[];
  history: QueueEntry[];
};

export type OnelinerEntry = { username: string; text: string; time: string; flag: string };

export type OnlineUser = { name: string; flag: string };

export type StreamSource = {
  name: string;
  url: string;
  bitrate: string;
  type: string;
  nowPlayingUrl?: string;
  nowPlayingFormat?: string;
  nowPlayingIntervalMs?: number;
  artworkUrl?: string;
};

// ─── Parsers ───────────────────────────────────────────────────────────────────
function parseLength(raw: string | null | undefined): number {
  if (!raw) return 0;
  const v = raw.trim();
  if (v.includes(":")) {
    const parts = v.split(":").map((p) => Number.parseInt(p, 10) || 0);
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  return Number.parseInt(v, 10) || 0;
}

function parseEntry(entry: Element): QueueEntry {
  const artistEl = entry.getElementsByTagName("artist")[0];
  const songEl = entry.getElementsByTagName("song")[0];
  return {
    artist: artistEl?.textContent?.trim() ?? "-",
    artistId: artistEl?.getAttribute("id") ?? "",
    song: songEl?.textContent?.trim() ?? "-",
    songId: songEl?.getAttribute("id") ?? "",
    lengthSec: parseLength(songEl?.getAttribute("length")),
    requester: txt(entry, "requester") || "-",
    playstart: txt(entry, "playstart"),
  };
}

export function parsePlaylist(doc: Document): PlaylistData {
  const root = doc.documentElement;
  const nowEl = root.getElementsByTagName("now")[0];
  const queueEl = root.getElementsByTagName("queue")[0];
  const historyEl = root.getElementsByTagName("history")[0];

  const nowEntry = nowEl?.getElementsByTagName("entry")[0];
  const queueEntries = queueEl ? Array.from(queueEl.getElementsByTagName("entry")) : [];
  const historyEntries = historyEl ? Array.from(historyEl.getElementsByTagName("entry")) : [];

  return {
    now: nowEntry ? parseEntry(nowEntry) : null,
    queue: queueEntries.slice(0, MAX_QUEUE).map(parseEntry),
    history: historyEntries.slice(0, MAX_HISTORY).map(parseEntry),
  };
}

function flagFrom(el: Element | null | undefined, tag: string): string {
  if (!el) return "";
  const c = el.getElementsByTagName(tag)[0];
  return c?.getAttribute("flag") ?? "";
}

export function parseOneliners(doc: Document): OnelinerEntry[] {
  const entries = Array.from(doc.getElementsByTagName("entry"));
  return entries.slice(0, MAX_ONELINERS).map((el) => ({
    username:
      txt(el, "author") || txt(el, "user") || txt(el, "username") || txt(el, "nick") || "anon",
    text: txt(el, "message") || txt(el, "text") || el.textContent?.trim() || "",
    time: el.getAttribute("time") || txt(el, "time") || txt(el, "timestamp") || "",
    flag:
      flagFrom(el, "author") ||
      flagFrom(el, "user") ||
      flagFrom(el, "username") ||
      flagFrom(el, "nick") ||
      "",
  }));
}

export function parseOnline(doc: Document): { users: OnlineUser[]; total: number } {
  const userEls = Array.from(doc.getElementsByTagName("user"));
  const users: OnlineUser[] = userEls
    .map((u) => ({
      name: u.textContent?.trim() || u.getAttribute("name") || "",
      flag: u.getAttribute("flag") || "",
    }))
    .filter((u) => u.name);
  const countEl = doc.getElementsByTagName("count")[0];
  const totalAttr = doc.documentElement.getAttribute("count");
  const fromText = countEl ? Number.parseInt(countEl.textContent || "", 10) : NaN;
  const fromAttr = totalAttr ? Number.parseInt(totalAttr, 10) : NaN;
  const total = Number.isFinite(fromText) ? fromText : Number.isFinite(fromAttr) ? fromAttr : users.length;
  return { users, total };
}

export function parseStreams(doc: Document): StreamSource[] {
  const streamEls = Array.from(doc.getElementsByTagName("stream"));
  return streamEls.map((s) => {
    const url = s.getAttribute("url") || txt(s, "url") || s.textContent?.trim() || "";
    const typeEl = s.getElementsByTagName("type")[0];
    const nowPlayingUrl =
      s.getAttribute("nowPlayingUrl") ||
      s.getAttribute("nowplaying_url") ||
      txt(s, "nowPlayingUrl") ||
      txt(s, "nowplaying_url") ||
      txt(s, "nowplaying") ||
      "";
    const nowPlayingFormat =
      s.getAttribute("nowPlayingFormat") ||
      s.getAttribute("nowplaying_format") ||
      txt(s, "nowPlayingFormat") ||
      txt(s, "nowplaying_format") ||
      "";
    const nowPlayingIntervalRaw =
      s.getAttribute("nowPlayingIntervalMs") ||
      s.getAttribute("nowplaying_interval_ms") ||
      txt(s, "nowPlayingIntervalMs") ||
      txt(s, "nowplaying_interval_ms") ||
      "";
    const nowPlayingIntervalMs = Number.parseInt(nowPlayingIntervalRaw, 10);
    const artworkUrl =
      s.getAttribute("artworkUrl") ||
      s.getAttribute("logo") ||
      txt(s, "artworkUrl") ||
      txt(s, "logo") ||
      "";
    return {
      name: s.getAttribute("name") || txt(s, "name") || "Stream",
      url,
      bitrate: s.getAttribute("bitrate") || txt(s, "bitrate") || "",
      type: typeEl?.textContent?.trim() || s.getAttribute("type") || "",
      ...(nowPlayingUrl ? { nowPlayingUrl } : {}),
      ...(nowPlayingFormat ? { nowPlayingFormat } : {}),
      ...(Number.isFinite(nowPlayingIntervalMs) && nowPlayingIntervalMs > 0
        ? { nowPlayingIntervalMs }
        : {}),
      ...(artworkUrl ? { artworkUrl } : {}),
    };
  });
}

// ─── Display helpers ───────────────────────────────────────────────────────────
export function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function computeTimeLeft(playstart: string, lengthSec: number): string {
  if (!playstart || !lengthSec) return "-";
  const start = Date.parse(playstart);
  if (!Number.isFinite(start)) return formatDuration(lengthSec);
  const endMs = start + lengthSec * 1000;
  const remaining = Math.max(0, Math.round((endMs - Date.now()) / 1000));
  return formatDuration(remaining);
}

export function formatOnelinerTime(raw?: string) {
  const v = raw?.trim();
  if (!v) return "--:--:--";
  const m = v.match(/(\d{2}:\d{2}:\d{2})/);
  if (m) return m[1];
  const t = Date.parse(v);
  if (Number.isFinite(t)) return new Date(t).toLocaleTimeString();
  return v;
}

// ─── Scenestream / Demovibes external link helpers ─────────────────────────────
const DEMOVIBES_BASE = "https://scenestream.net/demovibes";

export function songUrl(id: string): string | null {
  return id ? `${DEMOVIBES_BASE}/song/${encodeURIComponent(id)}/` : null;
}
export function artistUrl(id: string): string | null {
  return id ? `${DEMOVIBES_BASE}/artist/${encodeURIComponent(id)}/` : null;
}
export function userUrl(name: string): string | null {
  return name ? `${DEMOVIBES_BASE}/user/${encodeURIComponent(name)}/` : null;
}
export function groupUrl(id: string): string | null {
  return id ? `${DEMOVIBES_BASE}/group/${encodeURIComponent(id)}/` : null;
}
export function labelUrl(id: string): string | null {
  return id ? `${DEMOVIBES_BASE}/label/${encodeURIComponent(id)}/` : null;
}
export function platformUrl(value: string): string | null {
  return value ? `${DEMOVIBES_BASE}/platform/${encodeURIComponent(value)}/` : null;
}
export function compilationUrl(value: string): string | null {
  return value ? `${DEMOVIBES_BASE}/compilation/${encodeURIComponent(value)}/` : null;
}
export function themeUrl(id: string): string | null {
  return id ? `${DEMOVIBES_BASE}/theme/${encodeURIComponent(id)}/` : null;
}
export function faqUrl(id: string): string | null {
  return id ? `${DEMOVIBES_BASE}/faq/${encodeURIComponent(id)}/` : null;
}
export function threadUrl(id: string): string | null {
  return id ? `https://scenestream.net/forum/thread/${encodeURIComponent(id)}/` : null;
}
export function forumUrl(slug: string): string | null {
  return slug ? `https://scenestream.net/forum/${encodeURIComponent(slug)}/` : null;
}
