// Detects when a new build is deployed and reloads the page.
// On site entry, compares the current build signature to the one stored
// in localStorage from the previous visit. If they differ, the cached
// assets are stale, so we force a hard reload to pick up the new build.
// Also re-checks periodically and on focus/visibility/pageshow events
// for long-lived sessions (especially "Add to Home Screen" installs).

const STORAGE_KEY = "qumran:buildSignature";

let currentSignature: string | null = null;
let timer: number | null = null;
let reloading = false;

async function fetchSignature(): Promise<string | null> {
  try {
    const res = await fetch(`/?v=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Extract hashed asset references (Vite emits /assets/index-XXXX.js etc.)
    const matches = html.match(/\/assets\/[^"']+\.(?:js|css)/g);
    if (!matches || matches.length === 0) return null;
    return matches.sort().join("|");
  } catch {
    return null;
  }
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(sig: string) {
  try {
    localStorage.setItem(STORAGE_KEY, sig);
  } catch {
    /* ignore quota / privacy mode */
  }
}

function hardReload() {
  if (reloading) return;
  reloading = true;
  // Cache-busting reload — append a param so the HTML itself isn't served from cache.
  const url = new URL(window.location.href);
  url.searchParams.set("_v", Date.now().toString());
  window.location.replace(url.toString());
}

async function check(isInitial = false) {
  const sig = await fetchSignature();
  if (!sig) return;

  if (isInitial) {
    const stored = readStored();
    currentSignature = sig;
    if (stored && stored !== sig) {
      // Returning visitor on a stale cached bundle — refresh to newest build.
      writeStored(sig);
      hardReload();
      return;
    }
    writeStored(sig);
    return;
  }

  if (currentSignature === null) {
    currentSignature = sig;
    writeStored(sig);
    return;
  }
  if (sig !== currentSignature) {
    writeStored(sig);
    window.location.reload();
  }
}

export function startVersionCheck() {
  if (timer !== null) return;
  // Initial signature — compares against localStorage from previous visit.
  void check(true);
  // Re-check periodically and when the app comes back to focus / visibility.
  timer = window.setInterval(() => check(), 2 * 60 * 1000);
  window.addEventListener("focus", () => check());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  window.addEventListener("pageshow", (e) => {
    // bfcache restore — common on iOS home-screen apps
    if ((e as PageTransitionEvent).persisted) void check();
  });
}
