// Detects when a new build is deployed and reloads the page.
// Useful for browser refreshes and especially for "Add to Home Screen"
// installs where the app may resume from a stale cached state.

let currentSignature: string | null = null;
let timer: number | null = null;

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

async function check() {
  const sig = await fetchSignature();
  if (!sig) return;
  if (currentSignature === null) {
    currentSignature = sig;
    return;
  }
  if (sig !== currentSignature) {
    // New build deployed — reload to get fresh code.
    window.location.reload();
  }
}

export function startVersionCheck() {
  if (timer !== null) return;
  // Initial signature
  void check();
  // Re-check periodically and when the app comes back to focus / visibility.
  timer = window.setInterval(check, 2 * 60 * 1000);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  window.addEventListener("pageshow", (e) => {
    // bfcache restore — common on iOS home-screen apps
    if ((e as PageTransitionEvent).persisted) void check();
  });
}
