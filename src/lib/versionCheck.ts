// Version freshness check for PWA / long-lived tabs.
//
// The build embeds `__BUILD_ID__` at compile time (see vite.config.ts). At
// runtime we periodically fetch `/index.html?ts=…` with cache-busting and
// look for a matching build id in a `<meta name="build-id" content="…">` tag
// or in a script URL that Vite hashes. If they diverge, the currently loaded
// bundle is out of date — we surface a callback so the UI can prompt or
// auto-reload, and we proactively unregister any service worker so the next
// hard reload actually fetches the new HTML.

declare const __BUILD_ID__: string;

export const CURRENT_BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

export type VersionCheckResult = {
  current: string;
  server: string | null;
  stale: boolean;
};

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?ts=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Prefer explicit meta tag if the app injects one.
    const meta = html.match(/<meta\s+name=["']build-id["']\s+content=["']([^"']+)["']/i);
    if (meta?.[1]) return meta[1];
    // Fallback: hashed asset filenames change every build. Combine them into
    // a stable digest so any bundle diff triggers a stale flag.
    const scripts = Array.from(html.matchAll(/src=["']([^"']+\.js)["']/gi)).map((m) => m[1]);
    if (scripts.length === 0) return null;
    return scripts.sort().join("|");
  } catch {
    return null;
  }
}

let clientFingerprint: string | null = null;
async function getClientFingerprint(): Promise<string | null> {
  if (clientFingerprint !== null) return clientFingerprint;
  try {
    // Reproduce the same fingerprint the server sniffer would return for the
    // *currently loaded* page, so we compare like-for-like even if
    // __BUILD_ID__ isn't embedded in index.html.
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
      .map((s) => new URL(s.src, location.href).pathname)
      .filter((p) => p.endsWith(".js"));
    clientFingerprint = scripts.length > 0 ? scripts.sort().join("|") : null;
    return clientFingerprint;
  } catch {
    return null;
  }
}

export async function checkForNewVersion(): Promise<VersionCheckResult> {
  const server = await fetchServerBuildId();
  const clientFp = await getClientFingerprint();
  const current = clientFp ?? CURRENT_BUILD_ID;
  const stale = server !== null && current !== null && server !== current;
  return { current, server, stale };
}

export async function forceReloadForNewVersion(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore
  }
  const url = new URL(location.href);
  url.searchParams.set("_v", Date.now().toString());
  location.replace(url.toString());
}

/** Poll for a new version every `intervalMs`. Fires `onStale` at most once
 *  per distinct server build id (persisted in localStorage). Returns a
 *  cleanup function. */
export function startVersionPolling(
  onStale: (result: VersionCheckResult) => void,
  intervalMs = 5 * 60_000,
): () => void {
  const NOTIFIED_KEY = "nectarine-build-id-notified";
  let cancelled = false;
  const tick = async () => {
    if (cancelled) return;
    const r = await checkForNewVersion();
    if (!r.stale || !r.server) return;
    let alreadyNotified: string | null = null;
    try { alreadyNotified = localStorage.getItem(NOTIFIED_KEY); } catch { /* ignore */ }
    if (alreadyNotified === r.server) return;
    try { localStorage.setItem(NOTIFIED_KEY, r.server); } catch { /* ignore */ }
    onStale(r);
  };
  const id = window.setInterval(tick, intervalMs);
  const onFocus = () => { void tick(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  const kickoff = window.setTimeout(tick, 5000);
  return () => {
    cancelled = true;
    window.clearInterval(id);
    window.clearTimeout(kickoff);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
  };
}
