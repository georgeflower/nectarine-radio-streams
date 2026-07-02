import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startVersionPolling, forceReloadForNewVersion } from "./lib/versionCheck";

createRoot(document.getElementById("root")!).render(<App />);

// Poll for new deploys. If a new build is detected and the tab isn't
// actively playing audio in the foreground, hard-reload to avoid users
// (especially on iOS PWA) being stranded on a stale bundle.
startVersionPolling((res) => {
  console.info("[version] stale build detected", res);
  try {
    window.dispatchEvent(new CustomEvent("nectarine:update-available", { detail: res }));
  } catch { /* ignore */ }
  // Auto-reload only if the page has been hidden recently (safe moment).
  if (document.visibilityState === "hidden") {
    void forceReloadForNewVersion();
  }
});
