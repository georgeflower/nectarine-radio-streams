import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startVersionPolling, forceReloadForNewVersion } from "./lib/versionCheck";

createRoot(document.getElementById("root")!).render(<App />);

// Version polling is only safe in production on the real published origin.
// In dev / Lovable preview / iframe, index.html changes constantly (HMR,
// module graph, query hashes) which would fire a false "update available"
// toast every poll cycle.
const isProd = import.meta.env.PROD;
const host = typeof location !== "undefined" ? location.hostname : "";
const inIframe = typeof window !== "undefined" && window.top !== window.self;
const isPreviewHost =
  host.startsWith("id-preview--") ||
  host.startsWith("preview--") ||
  host.endsWith(".lovableproject.com") ||
  host.endsWith(".lovableproject-dev.com") ||
  host.endsWith(".lovable.app") ||
  host === "localhost" ||
  host === "127.0.0.1";

if (isProd && !inIframe && !isPreviewHost) {
  startVersionPolling((res) => {
    console.info("[version] stale build detected", res);
    try {
      window.dispatchEvent(new CustomEvent("nectarine:update-available", { detail: res }));
    } catch { /* ignore */ }
    if (document.visibilityState === "hidden") {
      void forceReloadForNewVersion();
    }
  });
}

