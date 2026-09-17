import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import {
  startVersionPolling,
  forceReloadForNewVersion,
} from "./lib/versionCheck";
import { prepareFreshStartup } from "./lib/startupFreshness";

function renderApp() {
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(<App />);
}

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
  // Check before mounting so an installed app cannot paint a stale interface
  // while Android revalidates its cached launch document.
  void (async () => {
    const shouldRender = await prepareFreshStartup();
    if (shouldRender) renderApp();
  })();

  startVersionPolling((res) => {
    console.info("[version] stale build detected", res);
    try {
      window.dispatchEvent(new CustomEvent("nectarine:update-available", { detail: res }));
    } catch { /* ignore */ }
    // Auto-reload only when the tab is hidden AND nothing is playing. A hidden
    // tab that is still playing must never be reloaded: it stops the audio, and
    // autoplay policy then blocks automatic resume until a user gesture.
    if (document.visibilityState === "hidden" && !isAudioPlaying()) {
      void forceReloadForNewVersion();
    }
  });
} else {
  renderApp();
}
