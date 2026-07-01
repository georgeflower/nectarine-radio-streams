// Playback watchdog: configurable thresholds + diagnostic state for the
// AudioPlayer's mobile background-resume logic. Values persist in
// localStorage so users can tune iOS vs Android separately.

export type Platform = "ios" | "android" | "desktop";

export type WatchdogConfig = {
  iosStallTimeoutSec: number;
  androidStallTimeoutSec: number;
  desktopStallTimeoutSec: number;
  iosVisibilityResumeDelayMs: number;
  androidVisibilityResumeDelayMs: number;
  desktopVisibilityResumeDelayMs: number;
};

export const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
  iosStallTimeoutSec: 15,
  androidStallTimeoutSec: 30,
  desktopStallTimeoutSec: 30,
  iosVisibilityResumeDelayMs: 250,
  androidVisibilityResumeDelayMs: 500,
  desktopVisibilityResumeDelayMs: 0,
};

const STORAGE_KEY = "playback-watchdog-config-v1";

const loadConfig = (): WatchdogConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WATCHDOG_CONFIG };
    const parsed = JSON.parse(raw) as Partial<WatchdogConfig>;
    return { ...DEFAULT_WATCHDOG_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_WATCHDOG_CONFIG };
  }
};

let config: WatchdogConfig = loadConfig();
const configListeners = new Set<(c: WatchdogConfig) => void>();

export const getWatchdogConfig = (): WatchdogConfig => config;

export const setWatchdogConfig = (next: Partial<WatchdogConfig>) => {
  config = { ...config, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
  configListeners.forEach((fn) => fn(config));
};

export const resetWatchdogConfig = () => {
  setWatchdogConfig({ ...DEFAULT_WATCHDOG_CONFIG });
};

export const subscribeWatchdogConfig = (fn: (c: WatchdogConfig) => void): (() => void) => {
  configListeners.add(fn);
  return () => configListeners.delete(fn);
};

export const detectPlatform = (): Platform => {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
};

export const getStallTimeoutMs = (): number => {
  const p = detectPlatform();
  const sec =
    p === "ios" ? config.iosStallTimeoutSec :
    p === "android" ? config.androidStallTimeoutSec :
    config.desktopStallTimeoutSec;
  return Math.max(1, sec) * 1000;
};

export const getVisibilityResumeDelayMs = (): number => {
  const p = detectPlatform();
  return Math.max(0,
    p === "ios" ? config.iosVisibilityResumeDelayMs :
    p === "android" ? config.androidVisibilityResumeDelayMs :
    config.desktopVisibilityResumeDelayMs,
  );
};

// --- Diagnostics state -----------------------------------------------------

export type PlaybackMode = "idle" | "bypass" | "mse" | "webaudio";

export type WatchdogDiagnostics = {
  platform: Platform;
  playbackMode: PlaybackMode;
  lastResumeAt: number | null;
  lastReconnectAt: number | null;
  lastStallAt: number | null;
  lastVisibilityAt: number | null;
  reconnectCount: number;
  resumeCount: number;
  lastEvent: string | null;
};

let diag: WatchdogDiagnostics = {
  platform: detectPlatform(),
  playbackMode: "idle",
  lastResumeAt: null,
  lastReconnectAt: null,
  lastStallAt: null,
  lastVisibilityAt: null,
  reconnectCount: 0,
  resumeCount: 0,
  lastEvent: null,
};

const diagListeners = new Set<(d: WatchdogDiagnostics) => void>();

export const getWatchdogDiagnostics = (): WatchdogDiagnostics => diag;

export const subscribeWatchdogDiagnostics = (fn: (d: WatchdogDiagnostics) => void): (() => void) => {
  diagListeners.add(fn);
  return () => diagListeners.delete(fn);
};

const updateDiag = (patch: Partial<WatchdogDiagnostics>) => {
  diag = { ...diag, ...patch };
  diagListeners.forEach((fn) => fn(diag));
};

export const reportPlaybackMode = (mode: PlaybackMode) => updateDiag({ playbackMode: mode, lastEvent: `mode:${mode}` });

// --- Playback logging ------------------------------------------------------
// Structured, platform-tagged console logging for the AudioPlayer's
// reconnect/stall/resume paths. Enabled by default; disable at runtime with
// `localStorage.setItem("playback-debug", "0")`.

export type PlaybackLogLevel = "info" | "warn" | "error";
export type PlaybackLogEntry = {
  id: number;
  ts: number;
  level: PlaybackLogLevel;
  platform: Platform;
  category: string;
  message: string;
  data?: Record<string, unknown>;
};

const LOG_RING_MAX = 100;
const logRing: PlaybackLogEntry[] = [];
let logSeq = 0;

const debugEnabled = (): boolean => {
  try {
    return localStorage.getItem("playback-debug") !== "0";
  } catch {
    return true;
  }
};

export const getPlaybackLog = (): PlaybackLogEntry[] => logRing.slice();

export const logPlayback = (
  level: PlaybackLogLevel,
  category: string,
  message: string,
  data?: Record<string, unknown>,
) => {
  if (!debugEnabled()) return;
  const entry: PlaybackLogEntry = {
    id: ++logSeq,
    ts: Date.now(),
    level,
    platform: diag.platform,
    category,
    message,
    data,
  };
  logRing.push(entry);
  if (logRing.length > LOG_RING_MAX) logRing.shift();
  const prefix = `[AudioPlayer#${entry.id} ${entry.platform} ${new Date(entry.ts).toISOString()}] ${category}:`;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  if (data !== undefined) fn(prefix, message, data);
  else fn(prefix, message);
};
export const reportResume = (reason: string) => updateDiag({
  lastResumeAt: Date.now(),
  resumeCount: diag.resumeCount + 1,
  lastEvent: `resume:${reason}`,
});
export const reportReconnect = (reason: string) => updateDiag({
  lastReconnectAt: Date.now(),
  reconnectCount: diag.reconnectCount + 1,
  lastEvent: `reconnect:${reason}`,
});
export const reportStall = () => updateDiag({ lastStallAt: Date.now(), lastEvent: "stall" });
export const reportVisibility = (state: string) => updateDiag({ lastVisibilityAt: Date.now(), lastEvent: `visibility:${state}` });
