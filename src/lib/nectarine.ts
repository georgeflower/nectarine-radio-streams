// Ported from https://github.com/georgeflower/nectarine-demoscene-radio (app.js)
export const API_ROOT = "https://scenestream.net/demovibes/xml/";

const ARTIST_TAGS = ["artist", "song artist", "track artist"];
const TITLE_TAGS = ["title", "song", "track", "name"];
const REQUESTED_BY_TAGS = ["requestedby", "requested_by", "requested by"];
const TIME_LEFT_TAGS = ["timeleft", "time_left", "time left"];
const RATING_TAGS = ["rating"];
const VOTES_TAGS = ["votes"];
const ONELINER_USER_TAGS = ["username", "nick", "user", "name"];
const ONELINER_TEXT_TAGS = ["text", "message", "msg", "line"];
const ONELINER_TIME_TAGS = ["time", "timestamp", "date"];
const USER_TAGS = ["username", "nick", "name", "user"];
const USER_TOTAL_TAGS = ["total", "count", "online", "users_online", "total_online"];

export const FALLBACK_ENDPOINTS = [
  "now_playing.xml",
  "oneliner.xml",
  "users.xml",
  "queue.xml",
  "lastplayed.xml",
  "stats.xml",
  "news.xml",
];

export const AUTO_REFRESH_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ONELINERS = 8;

const API_PROXY =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("apiProxy")
    : null;

export function toTitle(endpoint: string) {
  return endpoint
    .replace(/\.xml$/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeTag(tag: string) {
  return String(tag).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getNodesByTags(doc: Document, tags: string[], parent: Document | Element = doc) {
  const wanted = new Set(tags.map(normalizeTag));
  const source =
    parent === doc
      ? Array.from(doc.getElementsByTagName("*"))
      : Array.from((parent as Element).children);
  return source.filter((n) => wanted.has(normalizeTag(n.tagName)));
}

function getText(doc: Document, tags: string[], parent: Document | Element = doc): string {
  const source =
    parent === doc
      ? Array.from(doc.getElementsByTagName("*"))
      : Array.from((parent as Element).children);
  for (const tag of tags) {
    const wanted = normalizeTag(tag);
    for (const c of source) {
      if (normalizeTag(c.tagName) !== wanted) continue;
      const v = c.textContent?.trim();
      if (v) return v;
    }
  }
  return "-";
}

export function listUsers(doc: Document): string[] {
  const values = new Set<string>();
  getNodesByTags(doc, USER_TAGS).forEach((n) => {
    const v = n.textContent?.trim();
    if (v) values.add(v);
  });
  return Array.from(values);
}

export type OnelinerEntry = { username: string; text: string; time: string };

export function parseOneliners(doc: Document): OnelinerEntry[] {
  const entries: OnelinerEntry[] = [];
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (el.children.length === 0) continue;
    const username = getText(doc, ONELINER_USER_TAGS, el);
    const text = getText(doc, ONELINER_TEXT_TAGS, el);
    if (username === "-" || text === "-") continue;
    const time = getText(doc, ONELINER_TIME_TAGS, el);
    entries.push({ username, text, time });
  }
  if (entries.length) return entries.slice(0, MAX_ONELINERS);
  return [
    {
      username: getText(doc, ONELINER_USER_TAGS),
      text: getText(doc, ONELINER_TEXT_TAGS),
      time: getText(doc, ONELINER_TIME_TAGS),
    },
  ];
}

export function formatOnelinerTime(raw?: string) {
  const v = raw?.trim();
  if (!v || v === "-") return "--:--:--";
  const m = v.match(/(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : v;
}

export function buildStars(rating: number) {
  const safe = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
  const filled = Math.round(safe);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export type NowPlaying = {
  title: string;
  artist: string;
  requestedBy: string;
  timeLeft: string;
  rating: string;
  votes: string;
  numericRating: number;
};

export function parseNowPlaying(doc: Document): NowPlaying {
  const rating = getText(doc, RATING_TAGS);
  return {
    title: getText(doc, TITLE_TAGS),
    artist: getText(doc, ARTIST_TAGS),
    requestedBy: getText(doc, REQUESTED_BY_TAGS),
    timeLeft: getText(doc, TIME_LEFT_TAGS),
    rating,
    votes: getText(doc, VOTES_TAGS),
    numericRating: Number.parseFloat(rating),
  };
}

export function parseUsersDoc(doc: Document) {
  const users = listUsers(doc);
  const totalText = getText(doc, USER_TOTAL_TAGS);
  const n = Number.parseInt(totalText, 10);
  const total = Number.isFinite(n) ? n : users.length;
  return { users, total };
}

function xmlNodeToObject(node: Element): unknown {
  const hasEl = Array.from(node.childNodes).some((c) => c.nodeType === Node.ELEMENT_NODE);
  if (!hasEl) return node.textContent?.trim() ?? "";
  const result: Record<string, unknown> = {};
  for (const child of Array.from(node.children)) {
    const parsed = xmlNodeToObject(child);
    if (Object.hasOwn(result, child.tagName)) {
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

export function parseXml(text: string) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function buildRequestUrls(url: string) {
  if (API_PROXY) {
    const hasPlaceholder = API_PROXY.includes("{url}");
    return [
      hasPlaceholder
        ? API_PROXY.replace("{url}", encodeURIComponent(url))
        : `${API_PROXY}${encodeURIComponent(url)}`,
    ];
  }
  return [url];
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

export async function fetchText(url: string) {
  const urls = buildRequestUrls(url);
  let lastErr: unknown = new Error(`fetch failed: ${url}`);
  for (const u of urls) {
    try {
      const r = await fetchWithTimeout(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function discoverEndpoints(): Promise<string[]> {
  try {
    const html = await fetchText(API_ROOT);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = Array.from(doc.querySelectorAll("a[href$='.xml']"))
      .map((a) => a.getAttribute("href")?.trim())
      .filter(Boolean)
      .map((h) => h!.split("/").pop()!)
      .filter(Boolean);
    return Array.from(new Set([...FALLBACK_ENDPOINTS, ...found]));
  } catch {
    return FALLBACK_ENDPOINTS;
  }
}
