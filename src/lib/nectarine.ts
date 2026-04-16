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

export type OnelinerEntry = { username: string; text: string; time: string };

export type StreamSource = { name: string; url: string; bitrate: string; type: string };

// ─── Parsers ───────────────────────────────────────────────────────────────────
function parseEntry(entry: Element): QueueEntry {
  const artistEl = entry.getElementsByTagName("artist")[0];
  const songEl = entry.getElementsByTagName("song")[0];
  const lengthAttr = songEl?.getAttribute("length") ?? "0";
  return {
    artist: artistEl?.textContent?.trim() ?? "-",
    artistId: artistEl?.getAttribute("id") ?? "",
    song: songEl?.textContent?.trim() ?? "-",
    songId: songEl?.getAttribute("id") ?? "",
    lengthSec: Number.parseInt(lengthAttr, 10) || 0,
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

export function parseOneliners(doc: Document): OnelinerEntry[] {
  const items = Array.from(doc.getElementsByTagName("item"));
  const source = items.length ? items : Array.from(doc.getElementsByTagName("entry"));
  return source.slice(0, MAX_ONELINERS).map((el) => ({
    username: txt(el, "user") || txt(el, "username") || txt(el, "nick") || "anon",
    text: txt(el, "message") || txt(el, "text") || el.textContent?.trim() || "",
    time: txt(el, "time") || txt(el, "timestamp") || el.getAttribute("time") || "",
  }));
}

export function parseOnline(doc: Document): { users: string[]; total: number } {
  const userEls = Array.from(doc.getElementsByTagName("user"));
  const users = userEls
    .map((u) => u.textContent?.trim() || u.getAttribute("name") || "")
    .filter(Boolean);
  const totalAttr = doc.documentElement.getAttribute("count");
  const total = totalAttr ? Number.parseInt(totalAttr, 10) : users.length;
  return { users, total: Number.isFinite(total) ? total : users.length };
}

export function parseStreams(doc: Document): StreamSource[] {
  const streamEls = Array.from(doc.getElementsByTagName("stream"));
  return streamEls.map((s) => ({
    name: s.getAttribute("name") || txt(s, "name") || "Stream",
    url: s.getAttribute("url") || txt(s, "url") || s.textContent?.trim() || "",
    bitrate: s.getAttribute("bitrate") || txt(s, "bitrate") || "",
    type: s.getAttribute("type") || txt(s, "type") || "",
  }));
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
