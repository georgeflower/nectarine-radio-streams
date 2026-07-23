import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import {
  startVersionPolling,
  forceReloadForNewVersion,
  checkForNewVersion,
} from "./lib/versionCheck";

createRoot(document.getElementById("root")!).render(<App />);

// Version polling is only safe in production on the real published origin.
// In dev / Lovable preview / iframe, index.html changes constantly (HMR,
// module graph, query hashes) which would fire a false "update available"
// toast every poll cycle. Note: `.lovable.app` is intentionally NOT treated
// as a preview host — the published site lives there.
const isProd = import.meta.env.PROD;
const host = typeof location !== "undefined" ? location.hostname : "";
const inIframe = typeof window !== "undefined" && window.top !== window.self;
const isPreviewHost =
  host.startsWith("id-preview--") ||
  host.startsWith("preview--") ||
  host.endsWith(".lovableproject.com") ||
  host.endsWith(".lovableproject-dev.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

function isAudioPlaying(): boolean {
  try {
    const els = Array.from(document.querySelectorAll("audio"));
    return els.some((a) => !a.paused && !a.ended && a.currentTime > 0);
  } catch {
    return false;
  }
}

if (isProd && !inIframe && !isPreviewHost) {
  // Cold-start freshness check: if the loaded bundle is already stale when
  // the user opens the app, reload immediately — but only within the first
  // 15s window so we can never interrupt an active listening session later.
  const COLD_RELOAD_KEY = "nectarine-cold-reload";
  const startedAt = Date.now();
  void (async () => {
    try {
      const res = await checkForNewVersion();
      if (res.stale && Date.now() - startedAt < 15_000) {
        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(COLD_RELOAD_KEY) === "1";
        } catch {
          // Private-mode or storage-disabled browsers: treat as not yet reloaded.
        }
        if (alreadyReloaded) {
          console.warn("[version] cold-start still stale after reload, skipping to avoid loop", res);
        } else {
          console.info("[version] cold-start stale bundle, reloading", res);
          try {
            sessionStorage.setItem(COLD_RELOAD_KEY, "1");
          } catch {
            // Ignore storage failures; the reload itself is still allowed.
          }
          void forceReloadForNewVersion();
        }
      }
    } catch {
      // ignore
    }
  })();

  startVersionPolling((res) => {
    console.info("[version] stale build detected", res);
    try {
      window.dispatchEvent(new CustomEvent("nectarine:update-available", { detail: res }));
    } catch { /* ignore */ }
    // Auto-reload when the tab is hidden OR when nothing is currently
    // playing — either way the user won't hear an interruption.
    if (document.visibilityState === "hidden" || !isAudioPlaying()) {
      void forceReloadForNewVersion();
    }
  });
}
