// Fire-and-forget daily listener ping (unique listeners per country for the
// owner's weekly digest). Sent at most once per browser per Stockholm day,
// the first time the stream actually starts playing.
import { supabase } from "@/integrations/supabase/client";
import { getTelemetrySessionId } from "@/lib/streamTelemetry";
import { detectPlatform } from "@/lib/playbackWatchdog";

const STAMP_KEY = "nectarine-listener-ping-day";

const todayStockholm = (): string => {
  try {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

export const pingListener = (): void => {
  try {
    const day = todayStockholm();
    if (localStorage.getItem(STAMP_KEY) === day) return;
    localStorage.setItem(STAMP_KEY, day);
    void supabase.functions
      .invoke("listener-ping", { body: { client_id: getTelemetrySessionId(), platform: detectPlatform() } })
      .catch(() => {
        // Let it retry next start if the request failed.
        try { localStorage.removeItem(STAMP_KEY); } catch { /* ignore */ }
      });
  } catch {
    /* never disturb playback */
  }
};
