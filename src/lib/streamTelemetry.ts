// Anonymous stream failure telemetry.
// Fire-and-forget: nothing here may ever throw into playback code paths.
// No user identity is stored or transmitted — only a random session id.

import { detectPlatform } from "@/lib/playbackWatchdog";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "nectarine-telemetry-session-v1";
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-telemetry`;

const FLUSH_DEBOUNCE_MS = 5000;
const FLUSH_AT_QUEUE = 20;
const QUEUE_HARD_CAP = 100;
const CONNECTION_CHANGE_WINDOW_MS = 60_000;

export type StreamEventName =
  | "connect_ok"
  | "error"
  | "stall"
  | "ended"
  | "recovered"
  | "failover"
  | "switch"
  | "connection_change";

export type StreamEventInput = {
  event: StreamEventName;
  stream_url: string;
  stream_name?: string | null;
  bitrate?: number | null;
  reason?: string | null;
  media_error_code?: number | null;
  media_error_message?: string | null;
  network_state?: number | null;
  ready_state?: number | null;
  played_sec?: number | null;
};

type QueuedEvent = Record<string, unknown>;

// --- session id ------------------------------------------------------------

let cachedSessionId: string | null = null;

const randomId = (): string => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

export const getTelemetrySessionId = (): string => {
  if (cachedSessionId) return cachedSessionId;
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
    const next = randomId();
    localStorage.setItem(SESSION_KEY, next);
    cachedSessionId = next;
    return next;
  } catch {
    cachedSessionId = cachedSessionId ?? randomId();
    return cachedSessionId;
  }
};

// --- connection info -------------------------------------------------------

export type ConnectionInfo = {
  connectionType: string | null;
  effectiveType: string | null;
  downlink: number | null;
};

type NavConnection = {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (t: string, fn: () => void) => void;
};

const getNavConnection = (): NavConnection | null => {
  try {
    const nav = navigator as unknown as Record<string, NavConnection | undefined>;
    return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
  } catch {
    return null;
  }
};

export const getConnectionInfo = (): ConnectionInfo => {
  const c = getNavConnection();
  if (!c) return { connectionType: null, effectiveType: null, downlink: null };
  const downlink = typeof c.downlink === "number" && Number.isFinite(c.downlink) ? c.downlink : null;
  return {
    connectionType: c.type ?? null,
    effectiveType: c.effectiveType ?? null,
    downlink,
  };
};

// --- connection change tracking -------------------------------------------

let lastConnectionChangeAt: number | null = null;

export const noteConnectionChange = (): void => {
  lastConnectionChangeAt = Date.now();
};

export const msSinceConnectionChange = (): number | null => {
  if (lastConnectionChangeAt === null) return null;
  const elapsed = Date.now() - lastConnectionChangeAt;
  return elapsed <= CONNECTION_CHANGE_WINDOW_MS ? elapsed : null;
};

// --- queue + flush ---------------------------------------------------------

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const drain = (): QueuedEvent[] => {
  const batch = queue.splice(0, queue.length);
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return batch;
};

const send = (batch: QueuedEvent[], useBeacon: boolean): void => {
  if (batch.length === 0) return;
  const body = JSON.stringify({ events: batch });
  try {
    if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* drop silently */
    });
  } catch {
    /* drop silently */
  }
};

export const flushStreamEvents = (useBeacon = false): void => {
  try {
    send(drain(), useBeacon);
  } catch {
    /* ignore */
  }
};

export const recordStreamEvent = (input: StreamEventInput): void => {
  try {
    if (!input || !input.stream_url) return;
    const conn = getConnectionInfo();
    queue.push({
      session_id: getTelemetrySessionId(),
      platform: detectPlatform(),
      connection_type: conn.connectionType,
      effective_type: conn.effectiveType,
      downlink: conn.downlink,
      ms_since_connection_change: msSinceConnectionChange(),
      hidden: typeof document !== "undefined" ? document.hidden : null,
      ...input,
    });

    while (queue.length > QUEUE_HARD_CAP) queue.shift();

    if (queue.length >= FLUSH_AT_QUEUE) {
      flushStreamEvents(false);
      return;
    }
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushStreamEvents(false);
      }, FLUSH_DEBOUNCE_MS);
    }
  } catch {
    /* telemetry must never break playback */
  }
};

// --- lifecycle listeners (registered once at module load) -------------------

if (typeof window !== "undefined") {
  try {
    window.addEventListener("pagehide", () => flushStreamEvents(true));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flushStreamEvents(true);
    });
    const conn = getNavConnection();
    conn?.addEventListener?.("change", () => noteConnectionChange());
  } catch {
    /* ignore */
  }
}

// --- reliability view ------------------------------------------------------

export type StreamReliabilityRow = {
  stream_url: string | null;
  stream_name: string | null;
  bitrate: number | null;
  connects: number | null;
  failures: number | null;
  handover_events: number | null;
  avg_played_sec_before_failure: number | null;
  last_seen_at: string | null;
};

const RELIABILITY_TTL_MS = 10 * 60 * 1000;
let reliabilityCache: { at: number; rows: StreamReliabilityRow[] } | null = null;

export const fetchStreamReliability = async (): Promise<StreamReliabilityRow[]> => {
  if (reliabilityCache && Date.now() - reliabilityCache.at < RELIABILITY_TTL_MS) {
    return reliabilityCache.rows;
  }
  try {
    const { data, error } = await supabase.from("stream_reliability").select("*");
    if (error || !data) return [];
    const rows = data as unknown as StreamReliabilityRow[];
    reliabilityCache = { at: Date.now(), rows };
    return rows;
  } catch {
    return [];
  }
};
