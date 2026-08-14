import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { StreamSource } from "@/lib/nectarine";
import {
  DEFAULT_NOW_PLAYING_FORMAT,
  NOW_PLAYING_FALLBACK_ARTIST,
  NOW_PLAYING_FALLBACK_TITLE,
  normalizeNowPlayingValue,
  parseNowPlayingPayload,
  type NowPlayingTrack,
} from "@/lib/nowPlaying";
import { attachBufferedStream, isMseAudioSupported, type BufferedStreamHandle } from "@/lib/bufferedStream";
import { setAudioController, setAudioControlState, setPlayerTime } from "@/lib/cracktroUi";
import {
  getBestArtworkUrl,
  requestSongArtwork,
  subscribeSongArtwork,
} from "@/lib/songArtwork";
import { sendNowPlaying, sendScrobble, getLastfmSession } from "@/lib/lastfm";
import {
  getLiveEdgeReloadAfterHiddenMs,
  getStallTimeoutMs,
  getVisibilityResumeDelayMs,
  logPlayback,
  reportPlaybackMode,
  reportReconnect,
  reportResume,
  reportStall,
  reportVisibility,
} from "@/lib/playbackWatchdog";
import {
  fetchStreamReliability,
  noteConnectionChange,
  recordStreamEvent,
  type StreamEventName,
  type StreamReliabilityRow,
} from "@/lib/streamTelemetry";
import { rankStreams } from "@/lib/streamRanking";

type Props = {
  streams: StreamSource[];
  currentTrack?: { artist: string; song: string } | null;
  currentSongId?: string;
  onAnalyserReady?: (analyser: AnalyserNode) => void;
  onPlayingChange?: (playing: boolean) => void;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const proxiedUrl = (url: string, cacheBust = false) =>
  `${SUPABASE_URL}/functions/v1/audio-proxy?url=${encodeURIComponent(url)}${cacheBust ? `&t=${Date.now()}` : ""}`;

const isMixedContentUrl = (url: string): boolean => {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:" && /^http:\/\//i.test(url);
};

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const FAILOVER_COOLDOWN_MS = 60_000;
const BUFFER_POLL_MS = 2000;
const MOBILE_SOFT_RESUME_COOLDOWN_MS = 3000;
// At most one forced hard reload per real interface handover burst.
const HANDOVER_FORCE_COOLDOWN_MS = 15_000;

const PROGRESS_EPSILON_SEC = 0.2;

// Live-edge correction: keep playback near the end of the buffer so a stalled
// or resumed connection never drifts minutes behind the live stream. Desktop MSE
// deliberately pre-buffers up to ~30s (see targetBufferSec in bufferedStream.ts),
// so the soft and hard thresholds must sit above that ceiling or the watchdog
// fights the intentional pre-buffer. These values only trigger on genuine drift,
// such as a rewind to the start of the retained buffer, which shows up as many
// seconds of lag rather than tens. If targetBufferSec is ever raised, these
// constants must move with it.
const LIVE_EDGE_LEAD_SEC = 2;
const LIVE_SOFT_CATCHUP_LAG_SEC = 35;
const LIVE_HARD_SEEK_LAG_SEC = 45;
const LIVE_CATCHUP_RATE = 1.03;
const LIVE_SEEK_COOLDOWN_MS = 10_000;
const POST_SEEK_STALL_GRACE_MS = 5000;

// Mobile devices: route audio as plain HTML5 media (no Web Audio, no MSE) so
// iOS/Android keep playing while the app is backgrounded or the screen is off.
// Web Audio routing (createMediaElementSource) re-classifies playback as Web
// Audio and is killed by the OS within minutes when hidden. MSE-fed audio
// drains because background fetch/timers are throttled.
const isMobileDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Opera Mini|IEMobile/i.test(ua)) return true;
  // iPadOS reports as Mac; detect via touch.
  if (/Macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document) {
    return true;
  }
  return false;
};
const IS_MOBILE = isMobileDevice();

// Safari / iOS ship no Ogg Vorbis or Opus decoder for <audio>.
const isOggUrl = (url: string): boolean => /\.(ogg|opus)(\?|#|$)/i.test(url);
const IS_OGG_UNSUPPORTED = ((): boolean => {
  if (typeof document === "undefined") return false;
  try {
    const a = document.createElement("audio");
    return !a.canPlayType("audio/ogg; codecs=vorbis") && !a.canPlayType("audio/ogg; codecs=opus");
  } catch {
    return false;
  }
})();


const playbackUrl = (url: string, cacheBust = false): string => {
  // Both mobile and desktop can load a direct HTTPS stream. Doing so avoids
  // an extra proxy hop that VPNs and flaky networks can reset, and it lets the
  // browser use the origin's CORS headers for Web Audio / MSE. The proxy is
  // only required for HTTP sources on an HTTPS page (mixed-content blocking).
  if (!isMixedContentUrl(url)) return url;
  return proxiedUrl(url, cacheBust);
};

type StationNowPlayingConfig = {
  nowPlayingUrl: string;
  nowPlayingFormat?: string;
  nowPlayingIntervalMs?: number;
  artworkUrl?: string;
};

const DEFAULT_NOW_PLAYING_REFRESH_MS = 20_000;
const FALLBACK_ARTWORK = "/apple-touch-icon.png?v=20260611a";
const MEDIA_ARTWORK_SIZES = [96, 192, 256, 384, 512];

const inferArtworkType = (url: string): string => {
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return "image/jpeg";
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  if (cleanUrl.endsWith(".gif")) return "image/gif";
  if (cleanUrl.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
};

const resolveArtworkUrl = (rawUrl: string | undefined, fallbackArtwork: string): string => {
  if (!rawUrl) return fallbackArtwork;
  try {
    return new URL(rawUrl, window.location.href).toString();
  } catch {
    return fallbackArtwork;
  }
};

// For wsrv.nl URLs, rewrite w/h query params so each MediaSession artwork
// entry actually resolves to an image of the advertised size. Car head units
// (CarPlay especially) pick the closest match and reject mismatched dimensions.
const sizedArtworkUrl = (url: string, size: number): string => {
  if (!url.includes("wsrv.nl")) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(size));
    u.searchParams.set("h", String(size));
    return u.toString();
  } catch {
    return url;
  }
};


const AudioPlayer = ({ streams, currentTrack, currentSongId, onAnalyserReady, onPlayingChange }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferedStreamRef = useRef<BufferedStreamHandle | null>(null);

  const [reliabilityMap, setReliabilityMap] = useState<Map<string, StreamReliabilityRow>>(
    () => new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchStreamReliability();
        if (cancelled || !rows?.length) return;
        const map = new Map<string, StreamReliabilityRow>();
        for (const r of rows) if (r?.stream_url) map.set(r.stream_url, r);
        setReliabilityMap(map);
      } catch {
        /* ranking degrades to pure bitrate ordering */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playable = useMemo(
    () =>
      rankStreams(
        streams.filter(
          (s) => /^https?:\/\//i.test(s.url) && !(IS_OGG_UNSUPPORTED && isOggUrl(s.url)),
        ),
        reliabilityMap,
        { isMobile: IS_MOBILE, needsProxy: isMixedContentUrl },
      ),
    [streams, reliabilityMap],
  );


  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [bufferedAhead, setBufferedAhead] = useState(0);

  const shouldPlayRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const failedStreamsRef = useRef<Map<string, number>>(new Map());
  const attemptRecoveryRef = useRef<((opts?: { force?: boolean; reason?: string }) => void) | null>(null);
  const loadingRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const currentTargetRef = useRef<string | null>(null);
  const lastProgressAtRef = useRef(Date.now());
  const lastMediaTimeRef = useRef(0);
  const lastSoftResumeAtRef = useRef(0);
  const lastLiveSeekAtRef = useRef(0);
  const hiddenSinceRef = useRef<number | null>(null);
  const INITIAL_BUFFER_GRACE_MS = 8000;

  // --- telemetry plumbing (fire-and-forget, never throws) -------------------
  const selectedStreamRef = useRef<StreamSource | null>(null);
  const selectedUrlRef = useRef<string | null>(null);
  const playStartedAtRef = useRef<number | null>(null);
  const connectOkSentRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
  const reconnectingRef = useRef(false);
  const lastRecoveryReasonRef = useRef<string | null>(null);
  const connectionInfoRef = useRef<{ type: string | null; effectiveType: string | null }>({
    type: null,
    effectiveType: null,
  });
  const connectionRecoveryTimerRef = useRef<number | null>(null);
  const lastForcedHandoverAtRef = useRef(0);
  const stablePlaybackTimerRef = useRef<number | null>(null);
  const wasReconnectingRef = useRef(false);
  // Track recent MEDIA_ERR_NETWORK (code 2) events per stream so a VPN-induced
  // reset loop fails over to a different mirror instead of reloading forever.
  const lastCode2AtRef = useRef<Map<string, number>>(new Map());


  const playedSec = useCallback((): number | null => {
    const started = playStartedAtRef.current;
    if (started === null) return null;
    return Math.max(0, Math.round((Date.now() - started) / 1000));
  }, []);

  const telemetry = useCallback(
    (
      event: StreamEventName,
      extra?: Omit<Parameters<typeof recordStreamEvent>[0], "event" | "stream_url">,
    ) => {
      try {
        const s = selectedStreamRef.current;
        const url = s?.url ?? selectedUrlRef.current;
        if (!url) return;
        recordStreamEvent({
          event,
          stream_url: url,
          stream_name: s?.name ?? null,
          bitrate: Number(s?.bitrate) || null,
          ...extra,
        });
      } catch {
        /* telemetry must never break playback */
      }
    },
    [],
  );

  // Auto-pick first playable stream when list arrives or selection becomes invalid
  useEffect(() => {
    if (playable.length === 0) {
      setSelectedUrl(null);
      return;
    }
    if (!selectedUrl || !playable.some((s) => s.url === selectedUrl)) {
      setSelectedUrl(playable[0].url);
    }
  }, [playable, selectedUrl]);

  // Sync volume/mute
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      if (stallTimerRef.current !== null) window.clearTimeout(stallTimerRef.current);
      if (stablePlaybackTimerRef.current !== null) window.clearTimeout(stablePlaybackTimerRef.current);
      if (bufferedStreamRef.current) {
        bufferedStreamRef.current.cleanup();
        bufferedStreamRef.current = null;
      }
    };
  }, []);

  const markPlaybackAlive = useCallback((audio: HTMLAudioElement | null = audioRef.current) => {
    const t = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : lastMediaTimeRef.current;
    lastMediaTimeRef.current = Math.max(0, t || 0);
    lastProgressAtRef.current = Date.now();
    if (IS_MOBILE) setReconnecting(false);
  }, []);

  const notePlaybackProgress = useCallback((audio: HTMLAudioElement | null = audioRef.current) => {
    if (!audio) return;
    const t = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const previous = lastMediaTimeRef.current;
    if (t > previous + PROGRESS_EPSILON_SEC || t < previous - 2) {
      lastMediaTimeRef.current = Math.max(0, t);
      lastProgressAtRef.current = Date.now();
      if (IS_MOBILE) setReconnecting(false);
    }
  }, []);

  const snapshot = useCallback((extra?: Record<string, unknown>): Record<string, unknown> => {
    const a = audioRef.current;
    const now = Date.now();
    return {
      url: selectedUrl,
      target: currentTargetRef.current,
      currentTime: a ? Number(a.currentTime?.toFixed?.(2)) : null,
      readyState: a?.readyState ?? null,
      networkState: a?.networkState ?? null,
      paused: a?.paused ?? null,
      hidden: typeof document !== "undefined" ? document.hidden : null,
      sinceProgressMs: now - lastProgressAtRef.current,
      sinceLoadMs: now - lastLoadAtRef.current,
      retryCount: retryCountRef.current,
      shouldPlay: shouldPlayRef.current,
      loading: loadingRef.current,
      ...extra,
    };
  }, [selectedUrl]);


  // Background-resume watchdog: when the tab becomes visible again,
  // when the device wakes (pageshow), or when the network returns,
  // kick playback back to life if we should be playing but the
  // <audio> element has stalled or been paused by the OS.
  useEffect(() => {
    let pending: number | null = null;
    const doWake = (reason: string) => {
      logPlayback("info", "wake", `doWake(${reason})`, snapshot());
      if (!shouldPlayRef.current) { logPlayback("info", "wake", "skip: shouldPlay=false"); return; }
      if (loadingRef.current) { logPlayback("info", "wake", "skip: loading"); return; }
      const a = audioRef.current;
      if (!a) return;
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      if (IS_MOBILE) {
        notePlaybackProgress(a);
        const now = Date.now();
        const stallTimeoutMs = getStallTimeoutMs();
        const sinceProgress = now - lastProgressAtRef.current;
        // If the tab was hidden long enough, buffered <audio> content is
        // almost certainly stale (an older tune). Force a live-edge reload
        // instead of a soft resume to avoid playing minutes-old audio.
        const hiddenMs = hiddenSinceRef.current !== null ? now - hiddenSinceRef.current : 0;
        const liveEdgeAfter = getLiveEdgeReloadAfterHiddenMs();
        hiddenSinceRef.current = null;
        if (hiddenMs >= liveEdgeAfter) {
          logPlayback("warn", "wake", "mobile-hidden-too-long → live-edge reload", { hiddenMs, liveEdgeAfter });
          reportReconnect(`${reason}-mobile-hidden-${Math.round(hiddenMs / 1000)}s`);
          attemptRecoveryRef.current?.();
          return;
        }
        if (sinceProgress < stallTimeoutMs) {
          setReconnecting(false);
          if (a.paused && now - lastSoftResumeAtRef.current > MOBILE_SOFT_RESUME_COOLDOWN_MS) {
            lastSoftResumeAtRef.current = now;
            reportResume("mobile-soft-resume");
            logPlayback("info", "wake", "mobile-soft-resume", snapshot({ reason }));
            a.play().then(() => markPlaybackAlive(a)).catch((e) => {
              logPlayback("warn", "wake", "mobile-soft-resume play() rejected", { err: String(e) });
            });
          } else {
            logPlayback("info", "wake", "mobile: recent progress, no-op", { sinceProgress });
          }
          return;
        }
        if (a.paused && a.readyState >= 2) {
          lastSoftResumeAtRef.current = now;
          reportResume("mobile-paused-resume");
          logPlayback("warn", "wake", "mobile-paused-resume (past stall window)", snapshot({ reason }));
          a.play().then(() => markPlaybackAlive(a)).catch((e) => {
            logPlayback("error", "wake", "mobile-paused-resume play() failed", { err: String(e) });
            if (Date.now() - lastProgressAtRef.current > getStallTimeoutMs()) {
              reportReconnect(`${reason}-mobile-playfail`);
              attemptRecoveryRef.current?.();
            }
          });
          return;
        }
        logPlayback("warn", "wake", "mobile-stall-timeout → recovery", snapshot({ reason }));
        reportReconnect(`${reason}-mobile-stall-timeout`);
        attemptRecoveryRef.current?.();
        return;
      }
      const sinceLoad = Date.now() - lastLoadAtRef.current;
      if (!a.paused && a.readyState >= 2) {
        reportResume(reason);
        logPlayback("info", "wake", "desktop: already playing, no-op");
        return;
      }
      if (a.paused && a.readyState >= 2) {
        reportResume(reason);
        logPlayback("info", "wake", "desktop-paused-resume", snapshot({ reason }));
        a.play().catch((e) => {
          logPlayback("warn", "wake", "desktop play() rejected", { err: String(e) });
          if (sinceLoad > getStallTimeoutMs()) {
            reportReconnect(`${reason}-playfail`);
            attemptRecoveryRef.current?.();
          }
        });
        return;
      }
      if (sinceLoad > getStallTimeoutMs()) {
        logPlayback("warn", "wake", "desktop-stall-timeout → recovery", snapshot({ reason }));
        reportReconnect(reason);
        attemptRecoveryRef.current?.();
      } else {
        logPlayback("info", "wake", "desktop: still within initial buffer window", { sinceLoad });
      }
    };
    const schedule = (reason: string) => {
      if (pending !== null) window.clearTimeout(pending);
      const delay = getVisibilityResumeDelayMs();
      pending = window.setTimeout(() => {
        pending = null;
        doWake(reason);
      }, delay);
    };
    const onVisibility = () => {
      reportVisibility(document.visibilityState);
      logPlayback("info", "visibility", `state=${document.visibilityState}`);
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        schedule("visibility");
      }
    };
    const onPageshow = () => { logPlayback("info", "pageshow", "event"); schedule("pageshow"); };
    const onOnline = () => { logPlayback("info", "online", "event"); schedule("online"); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageshow);
    window.addEventListener("online", onOnline);
    return () => {
      if (pending !== null) window.clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageshow);
      window.removeEventListener("online", onOnline);
    };
  }, [markPlaybackAlive, notePlaybackProgress, snapshot]);

  // Network handover watchdog (wifi ↔ cellular). The old socket dies silently
  // on the interface switch, so a hard reload is the only reliable recovery.
  // The Network Information API is absent on iOS Safari — no-op there.
  useEffect(() => {
    type NavConnection = {
      type?: string;
      effectiveType?: string;
      addEventListener?: (t: string, fn: () => void) => void;
      removeEventListener?: (t: string, fn: () => void) => void;
    };
    let conn: NavConnection | null = null;
    try {
      const nav = navigator as unknown as Record<string, NavConnection | undefined>;
      conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
    } catch {
      conn = null;
    }
    if (!conn || typeof conn.addEventListener !== "function") return;

    connectionInfoRef.current = {
      type: conn.type ?? null,
      effectiveType: conn.effectiveType ?? null,
    };

    const onChange = () => {
      try {
        const prev = connectionInfoRef.current;
        const nextType = conn?.type ?? null;
        const nextEffective = conn?.effectiveType ?? null;
        const from = prev.type ?? prev.effectiveType ?? "unknown";
        const to = nextType ?? nextEffective ?? "unknown";
        const reason = `${from}->${to}`;

        const prevType = prev.type;
        const shouldForceReload =
          prevType !== null &&
          prevType !== "" &&
          nextType !== null &&
          nextType !== "" &&
          prevType !== nextType &&
          nextType !== "none";

        noteConnectionChange(shouldForceReload);
        connectionInfoRef.current = { type: nextType, effectiveType: nextEffective };
        logPlayback(
          "warn",
          "connection",
          `network change ${reason} (${shouldForceReload ? "interface handover" : "same-interface change"})`,
          snapshot(),
        );
        telemetry("connection_change", { reason, played_sec: playedSec() });

        if (connectionRecoveryTimerRef.current !== null) {
          window.clearTimeout(connectionRecoveryTimerRef.current);
          connectionRecoveryTimerRef.current = null;
        }
        if (!shouldPlayRef.current) return;

        if (!shouldForceReload) {
          logPlayback("info", "connection", "same-interface change, no reload", { reason });
          return;
        }

        const now = Date.now();
        if (now - lastForcedHandoverAtRef.current < HANDOVER_FORCE_COOLDOWN_MS) {
          logPlayback("info", "connection", "handover within cooldown — skipping forced reload");
          return;
        }
        lastForcedHandoverAtRef.current = now;

        connectionRecoveryTimerRef.current = window.setTimeout(() => {
          connectionRecoveryTimerRef.current = null;
          if (!shouldPlayRef.current) return;
          reportReconnect(`connection-change-${reason}`);
          attemptRecoveryRef.current?.({ force: true, reason: `connection-change-${reason}` });
        }, 1200);
      } catch {
        /* never let a connection event break playback */
      }
    };


    conn.addEventListener("change", onChange);
    return () => {
      if (connectionRecoveryTimerRef.current !== null) {
        window.clearTimeout(connectionRecoveryTimerRef.current);
        connectionRecoveryTimerRef.current = null;
      }
      conn?.removeEventListener?.("change", onChange);
    };
  }, [notePlaybackProgress, playedSec, snapshot, telemetry]);


  // Poll buffered-ahead while playing for UX visibility
  useEffect(() => {
    if (!playing || reconnecting || error) {
      setBufferedAhead(0);
      return;
    }
    const computeBuffered = () => {
      const a = audioRef.current;
      if (!a) return;
      try {
        const b = a.buffered;
        if (b.length === 0) {
          setBufferedAhead(0);
          return;
        }
        const end = b.end(b.length - 1);
        const ahead = Math.max(0, end - a.currentTime);
        setBufferedAhead(ahead);

        // Live-edge correction
        if (!shouldPlayRef.current || loadingRef.current || a.readyState < 2 || a.paused) return;
        if (ahead > LIVE_HARD_SEEK_LAG_SEC && Date.now() - lastLiveSeekAtRef.current > LIVE_SEEK_COOLDOWN_MS) {
          lastLiveSeekAtRef.current = Date.now();
          a.playbackRate = 1;
          const targetTime = end - LIVE_EDGE_LEAD_SEC;
          logPlayback("warn", "liveedge", "hard seek to live edge", { lagSec: Math.round(ahead), targetTime });
          try {
            if (targetTime > a.currentTime) a.currentTime = targetTime;
          } catch (e) {
            logPlayback("warn", "liveedge", "seek failed", { err: String(e) });
          }
        } else if (ahead > LIVE_SOFT_CATCHUP_LAG_SEC) {
          a.playbackRate = LIVE_CATCHUP_RATE;
          const anyA = a as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
          if ("preservesPitch" in anyA) anyA.preservesPitch = true;
          if ("webkitPreservesPitch" in anyA) anyA.webkitPreservesPitch = true;
        } else if (ahead < LIVE_EDGE_LEAD_SEC + 1 && a.playbackRate !== 1) {
          a.playbackRate = 1;
        }
      } catch {
        // ignore
      }
    };
    computeBuffered();
    const id = window.setInterval(computeBuffered, BUFFER_POLL_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const selectedStream = useMemo(
    () => playable.find((x) => x.url === selectedUrl) ?? null,
    [playable, selectedUrl],
  );

  useEffect(() => {
    selectedStreamRef.current = selectedStream;
    selectedUrlRef.current = selectedUrl;
  }, [selectedStream, selectedUrl]);

  useEffect(() => {
    reconnectingRef.current = reconnecting;
  }, [reconnecting]);

  const stationConfig = useMemo(() => {
    if (!selectedStream?.url || !selectedStream.nowPlayingUrl) return null;
    return {
      nowPlayingUrl: selectedStream.nowPlayingUrl,
      nowPlayingFormat: selectedStream.nowPlayingFormat || DEFAULT_NOW_PLAYING_FORMAT,
      nowPlayingIntervalMs: selectedStream.nowPlayingIntervalMs,
      artworkUrl: selectedStream.artworkUrl,
    };
  }, [selectedStream]);

  useEffect(() => {
    const artist = normalizeNowPlayingValue(currentTrack?.artist);
    const song = normalizeNowPlayingValue(currentTrack?.song);
    if (artist || song) {
      setNowPlaying({
        artist: artist || NOW_PLAYING_FALLBACK_ARTIST,
        title: song || selectedStream?.name || NOW_PLAYING_FALLBACK_TITLE,
      });
    }
  }, [currentTrack, selectedStream?.name]);

  // Last.fm scrobbling: nowPlaying immediately, scrobble at 50% or 240s.
  const scrobbleStateRef = useRef<{
    songId?: string;
    startedAt: number;
    scrobbled: boolean;
    artist: string;
    track: string;
    pausedMs: number;
  } | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
  const announcedNowPlayingRef = useRef<string | null>(null);

  // Track paused wall-clock time so we never scrobble unheard tracks.
  useEffect(() => {
    if (!playing) {
      pauseStartedAtRef.current = Date.now();
      return;
    }
    if (pauseStartedAtRef.current !== null) {
      const s = scrobbleStateRef.current;
      if (s) {
        const delta = Math.min(
          Date.now() - pauseStartedAtRef.current,
          Date.now() - s.startedAt * 1000,
        );
        s.pausedMs += Math.max(0, delta);
      }
      pauseStartedAtRef.current = null;
    }
  }, [playing]);

  const effectivePlayedSec = useCallback(
    (state: { startedAt: number; pausedMs: number }) => {
      const openPause =
        pauseStartedAtRef.current === null
          ? 0
          : Math.min(
              Date.now() - pauseStartedAtRef.current,
              Date.now() - state.startedAt * 1000,
            );
      return Math.max(
        0,
        Math.floor((Date.now() - state.startedAt * 1000 - state.pausedMs - openPause) / 1000),
      );
    },
    [],
  );

  useEffect(() => {
    if (!getLastfmSession()) return;
    const artist = normalizeNowPlayingValue(currentTrack?.artist);
    const track = normalizeNowPlayingValue(currentTrack?.song);
    if (!artist || !track) return;
    const key = currentSongId || `${artist}::${track}`;
    if (scrobbleStateRef.current?.songId === key) return;
    const prev = scrobbleStateRef.current;
    if (prev && !prev.scrobbled) {
      const played = effectivePlayedSec(prev);
      if (played >= 30 && played <= 1800) {
        prev.scrobbled = true;
        void sendScrobble(prev.artist, prev.track, prev.startedAt, played);
      }
    }
    scrobbleStateRef.current = {
      songId: key,
      startedAt: Math.floor(Date.now() / 1000),
      scrobbled: false,
      artist,
      track,
      pausedMs: 0,
    };
    if (playing) {
      void sendNowPlaying(artist, track);
    }
  }, [currentTrack, currentSongId, effectivePlayedSec, playing]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = scrobbleStateRef.current;
      if (!s || s.scrobbled) return;
      if (!getLastfmSession()) return;
      const played = effectivePlayedSec(s);
      // Nectarine is a live stream; browser-reported finite durations during
      // reconnects are proxy/chunk artifacts, not song lengths.
      const dur = 0;
      const threshold = 240;
      if (played >= threshold) {
        s.scrobbled = true;
        void sendScrobble(s.artist, s.track, s.startedAt, dur || undefined);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [playing, effectivePlayedSec]);

  // Flush the final track of the session on page unload.
  useEffect(() => {
    const onPageHide = () => {
      const s = scrobbleStateRef.current;
      if (!s || s.scrobbled) return;
      if (!getLastfmSession()) return;
      const played = effectivePlayedSec(s);
      if (played >= 30 && played <= 1800) {
        s.scrobbled = true;
        void sendScrobble(s.artist, s.track, s.startedAt, played, { keepalive: true });
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [effectivePlayedSec]);


  const ensureAudioGraph = useCallback(() => {
    // On mobile we intentionally skip Web Audio routing — once an
    // <audio> element is connected via createMediaElementSource() it
    // becomes Web Audio output, which iOS/Android suspend in the
    // background. Plain HTML5 media keeps playing on the lockscreen.
    if (IS_MOBILE) return;
    const a = audioRef.current;
    if (!a) return;
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(a);
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.8;
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
        if (analyserRef.current && onAnalyserReady) {
          onAnalyserReady(analyserRef.current);
        }
      } catch {
        // ignore — already connected
      }
    }
    if (ctx.state === "suspended") void ctx.resume();
  }, [onAnalyserReady]);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (stablePlaybackTimerRef.current !== null) {
      window.clearTimeout(stablePlaybackTimerRef.current);
      stablePlaybackTimerRef.current = null;
    }
  }, []);

  const playUrl = useCallback(
    async (url: string, cacheBust = false) => {
      const a = audioRef.current;
      if (!a) return;
      ensureAudioGraph();
      a.preload = "auto";
      a.setAttribute("playsinline", "");
      const target = playbackUrl(url, cacheBust);
      const isDirectMobileStream = IS_MOBILE && target === url;
      logPlayback("info", "playUrl", "enter", snapshot({ url, cacheBust, target, isDirectMobileStream }));
      if (isDirectMobileStream) {
        a.removeAttribute("crossorigin");
      } else {
        a.crossOrigin = "anonymous";
      }

      if (!cacheBust && currentTargetRef.current === target && a.readyState >= 2) {
        try {
          await a.play();
          reportResume("same-src-play");
          logPlayback("info", "playUrl", "same-src fast-path play() ok");
          markPlaybackAlive(a);
          try {
            const b = a.buffered;
            if (b.length > 0) {
              const end = b.end(b.length - 1);
              const lag = end - a.currentTime;
              if (lag > LIVE_HARD_SEEK_LAG_SEC) {
                lastLiveSeekAtRef.current = Date.now();
                const targetTime = end - LIVE_EDGE_LEAD_SEC;
                logPlayback("warn", "liveedge", "same-src resume seek to live edge", { lagSec: Math.round(lag) });
                if (targetTime > a.currentTime) a.currentTime = targetTime;
              }
            }
          } catch (e) {
            logPlayback("warn", "liveedge", "same-src seek failed", { err: String(e) });
          }
        } catch (e) {
          logPlayback("warn", "playUrl", "same-src play() rejected", { err: String(e) });
        }
        return;
      }

      if (bufferedStreamRef.current) {
        bufferedStreamRef.current.cleanup();
        bufferedStreamRef.current = null;
      }

      currentTargetRef.current = target;
      connectOkSentRef.current = false;
      if (stablePlaybackTimerRef.current !== null) {
        window.clearTimeout(stablePlaybackTimerRef.current);
        stablePlaybackTimerRef.current = null;
      }
      loadingRef.current = true;
      lastLoadAtRef.current = Date.now();

      const canUseMse =
        !IS_MOBILE &&
        isMseAudioSupported() &&
        (typeof document === "undefined" || document.visibilityState === "visible");
      if (canUseMse) {
        bufferedStreamRef.current = attachBufferedStream(a, target, {
          targetBufferSec: 30,
          onLiveSeek: () => {
            lastLiveSeekAtRef.current = Date.now();
          },
        });
        reportPlaybackMode("mse");
        logPlayback("info", "playUrl", "mode=mse (attached buffered stream)");
      } else {
        if (a.src !== target) a.src = target;
        reportPlaybackMode(IS_MOBILE ? "bypass" : "webaudio");
        logPlayback("info", "playUrl", `mode=${IS_MOBILE ? "bypass" : "webaudio"} (a.src set)`);
      }
      try {
        await a.play();
        logPlayback("info", "playUrl", "play() resolved");
        markPlaybackAlive(a);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError" || /interrupted by/i.test(msg)) {
          logPlayback("info", "playUrl", "play() aborted (superseded)", { name, msg });
          return;
        }
        logPlayback("error", "playUrl", "play() failed", { name, msg });
        throw err;
      } finally {
        lastLoadAtRef.current = Date.now();
        loadingRef.current = false;
      }
    },
    [ensureAudioGraph, markPlaybackAlive, snapshot],
  );

  const playSelected = useCallback(async () => {
    if (!selectedUrl) return;
    try {
      setError(null);
      setLoading(true);
      setReconnecting(false);
      shouldPlayRef.current = true;
      retryCountRef.current = 0;
      await playUrl(selectedUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
    } finally {
      setLoading(false);
    }
  }, [playUrl, selectedUrl]);

  const pickNextStream = useCallback(
    (currentUrl: string | null): string | null => {
      if (!playable.length) return null;
      const now = Date.now();
      const candidates = playable.filter((s) => s.url !== currentUrl);
      if (!candidates.length) return null;
      const fresh = candidates.filter((s) => {
        const failedAt = failedStreamsRef.current.get(s.url);
        return !failedAt || now - failedAt > FAILOVER_COOLDOWN_MS;
      });
      return (fresh[0] ?? candidates[0])?.url ?? null;
    },
    [playable],
  );

  const attemptRecovery = useCallback((opts?: { force?: boolean; reason?: string }) => {
    const force = opts?.force === true;
    const reason = opts?.reason ?? (force ? "forced" : "stall");
    logPlayback("warn", "recovery", `attemptRecovery(force=${force}, reason=${reason})`, snapshot());
    if (!shouldPlayRef.current) { logPlayback("info", "recovery", "skip: shouldPlay=false"); return; }
    clearTimers();
    const currentUrl = selectedUrl;
    if (!currentUrl) return;
    lastRecoveryReasonRef.current = reason;
    const a = audioRef.current;
    if (force) {
      // The connection is definitively gone — a soft resume cannot revive a
      // dead socket, so go straight to a cache-busted hard reload.
      retryCountRef.current = 0;
      setReconnecting(true);
      setError(null);
      reportReconnect(`force-${reason}`);
      logPlayback("warn", "recovery", "forced hard reload", { reason });
      
      retryTimerRef.current = window.setTimeout(() => {
        playUrl(currentUrl, true).catch((e) => {
          logPlayback("error", "recovery", "forced playUrl threw", { err: String(e) });
          attemptRecovery({ reason: `${reason}-retry` });
        });
      }, 0);
      return;
    }
    if (IS_MOBILE && a) {
      notePlaybackProgress(a);
      const now = Date.now();
      const sinceProgress = now - lastProgressAtRef.current;
      if (sinceProgress < getStallTimeoutMs()) {
        setReconnecting(false);
        setError(null);
        if (a.paused && now - lastSoftResumeAtRef.current > MOBILE_SOFT_RESUME_COOLDOWN_MS) {
          lastSoftResumeAtRef.current = now;
          reportResume("mobile-soft-resume");
          logPlayback("info", "recovery", "mobile-soft-resume (in-window)", { sinceProgress });
          a.play().then(() => markPlaybackAlive(a)).catch((e) => {
            logPlayback("warn", "recovery", "mobile-soft-resume play() rejected", { err: String(e) });
          });
        } else {
          logPlayback("info", "recovery", "mobile: recent progress, no-op", { sinceProgress });
        }
        return;
      }
      if (a.paused && a.readyState >= 2 && now - lastSoftResumeAtRef.current > MOBILE_SOFT_RESUME_COOLDOWN_MS) {
        lastSoftResumeAtRef.current = now;
        reportResume("mobile-paused-resume");
        logPlayback("warn", "recovery", "mobile-paused-resume (past window)", snapshot());
        a.play().then(() => markPlaybackAlive(a)).catch((e) => {
          logPlayback("error", "recovery", "mobile-paused-resume play() failed", { err: String(e) });
        });
        return;
      }
    }
    reportReconnect(`retry#${retryCountRef.current + 1}`);
    logPlayback("warn", "recovery", `retry#${retryCountRef.current + 1}/${MAX_RETRIES}`);

    if (retryCountRef.current < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[retryCountRef.current] ?? 4000;
      const shouldCacheBust = !IS_MOBILE || retryCountRef.current > 0;
      retryCountRef.current += 1;
      setReconnecting(true);
      setError(null);
      logPlayback("info", "recovery", `scheduling retry in ${delay}ms (cacheBust=${shouldCacheBust})`);
      retryTimerRef.current = window.setTimeout(() => {
        playUrl(currentUrl, shouldCacheBust).catch((e) => {
          logPlayback("error", "recovery", "retry playUrl threw", { err: String(e) });
          attemptRecovery({ reason });
        });
      }, delay);
      return;
    }

    failedStreamsRef.current.set(currentUrl, Date.now());
    const nextUrl = pickNextStream(currentUrl);
    if (!nextUrl || nextUrl === currentUrl) {
      if (IS_MOBILE) {
        // A phone that briefly loses connectivity should keep trying rather
        // than giving up permanently.
        retryCountRef.current = 0;
        setReconnecting(false);
        setError(null);
        const delay = Math.max(10_000, getStallTimeoutMs());
        logPlayback("warn", "recovery", `mobile: no alternative stream, backoff ${delay}ms`);
        retryTimerRef.current = window.setTimeout(() => {
          if (shouldPlayRef.current) attemptRecovery({ reason });
        }, delay);
        return;
      }
      logPlayback("error", "recovery", "all streams unavailable");
      setReconnecting(false);
      setError("All streams unavailable");
      shouldPlayRef.current = false;
      return;
    }
    logPlayback("warn", "recovery", "failover to next stream", { from: currentUrl, to: nextUrl });
    telemetry("failover", {
      reason: `${reason}: ${currentUrl} -> ${nextUrl}`,
      played_sec: playedSec(),
    });
    retryCountRef.current = 0;
    setSelectedUrl(nextUrl);
    setNowPlaying(null);
    setReconnecting(true);
    retryTimerRef.current = window.setTimeout(() => {
      playUrl(nextUrl, true).catch(() => attemptRecovery({ reason }));
    }, 500);
  }, [clearTimers, markPlaybackAlive, notePlaybackProgress, pickNextStream, playUrl, playedSec, selectedUrl, snapshot, telemetry]);
  useEffect(() => { attemptRecoveryRef.current = attemptRecovery; }, [attemptRecovery]);

  const scheduleStallCheck = useCallback((eventName: "waiting" | "stalled") => {
    if (!shouldPlayRef.current) return;
    if (loadingRef.current) return;
    if (Date.now() - lastLiveSeekAtRef.current < POST_SEEK_STALL_GRACE_MS) {
      logPlayback("info", "stall", `${eventName} suppressed by post-seek grace`);
      return;
    }
    if (Date.now() - lastLoadAtRef.current < INITIAL_BUFFER_GRACE_MS) {
      logPlayback("info", "stall", `${eventName} suppressed by initial-buffer grace`);
      return;
    }
    const a = audioRef.current;
    logPlayback("warn", "stall", `${eventName} event`, snapshot());
    if (IS_MOBILE) {
      if (typeof document !== "undefined" && document.hidden) {
        logPlayback("info", "stall", "mobile hidden, ignore");
        return;
      }
      notePlaybackProgress(a);
      const sinceProgress = Date.now() - lastProgressAtRef.current;
      const remaining = getStallTimeoutMs() - sinceProgress;
      if (remaining > 0) {
        setReconnecting(false);
        if (stallTimerRef.current !== null) return;
        if (typeof document !== "undefined" && document.hidden) return;
        logPlayback("info", "stall", `mobile: arm timer ${Math.max(1000, remaining)}ms`);
        stallTimerRef.current = window.setTimeout(() => {
          stallTimerRef.current = null;
          const audio = audioRef.current;
          notePlaybackProgress(audio);
          if (shouldPlayRef.current && Date.now() - lastProgressAtRef.current >= getStallTimeoutMs()) {
            reportStall();
            reportReconnect(`mobile-${eventName}-timeout`);
            logPlayback("warn", "stall", `mobile-${eventName}-timeout fired → recovery`);
            telemetry("stall", {
              reason: `mobile-${eventName}-timeout`,
              network_state: audio?.networkState ?? null,
              ready_state: audio?.readyState ?? null,
              played_sec: playedSec(),
            });
            attemptRecovery({ reason: `mobile-${eventName}-timeout` });
          }
        }, Math.max(1000, remaining));
        return;
      }
      reportStall();
      reportReconnect(`mobile-${eventName}-timeout`);
      logPlayback("warn", "stall", `mobile-${eventName} immediate → recovery`);
      telemetry("stall", {
        reason: `mobile-${eventName}-immediate`,
        network_state: a?.networkState ?? null,
        ready_state: a?.readyState ?? null,
        played_sec: playedSec(),
      });
      attemptRecovery({ reason: `mobile-${eventName}-immediate` });
      return;
    }
    reportStall();
    if (stallTimerRef.current !== null) return;
    if (typeof document !== "undefined" && document.hidden) return;
    logPlayback("info", "stall", `desktop: arm timer ${getStallTimeoutMs()}ms`);
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;
      if (shouldPlayRef.current) {
        const audio = audioRef.current;
        logPlayback("warn", "stall", "desktop stall timeout → recovery");
        telemetry("stall", {
          reason: `desktop-${eventName}-timeout`,
          network_state: audio?.networkState ?? null,
          ready_state: audio?.readyState ?? null,
          played_sec: playedSec(),
        });
        attemptRecovery({ reason: `desktop-${eventName}-timeout` });
      }
    }, getStallTimeoutMs());
  }, [attemptRecovery, notePlaybackProgress, playedSec, snapshot, telemetry]);

  const pausePlayback = useCallback(() => {
    shouldPlayRef.current = false;
    clearTimers();
    setReconnecting(false);
    wasReconnectingRef.current = false;
    const a = audioRef.current;
    if (!a) return;
    a.pause();
  }, [clearTimers]);

  const stopPlayback = useCallback(() => {
    shouldPlayRef.current = false;
    clearTimers();
    setReconnecting(false);
    wasReconnectingRef.current = false;
    if (bufferedStreamRef.current) {
      bufferedStreamRef.current.cleanup();
      bufferedStreamRef.current = null;
    }
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.removeAttribute("src");
    a.load();
    reportPlaybackMode("idle");
  }, [clearTimers]);

  const toggle = useCallback(async () => {
    if (playing) {
      pausePlayback();
      return;
    }
    await playSelected();
  }, [pausePlayback, playSelected, playing]);

  // Switch stream while playing
  const handleSelect = useCallback(
    async (url: string, autoplay = playing) => {
      // No-op if user re-picks the active stream and it's already playing.
      if (url === selectedUrl && autoplay && playing && !loadingRef.current) return;
      if (url !== selectedUrl) {
        telemetry("switch", {
          reason: `user-switch: ${selectedUrl ?? "none"} -> ${url}`,
          played_sec: playedSec(),
        });
      }
      clearTimers();
      retryCountRef.current = 0;
      setSelectedUrl(url);
      setError(null);
      setReconnecting(false);
      const a = audioRef.current;
      if (!a) return;
      setNowPlaying(null);
      if (autoplay) {
        try {
          setLoading(true);
          shouldPlayRef.current = true;
          if (!a.paused) a.pause();
          await playUrl(url);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Stream switch failed");
        } finally {
          setLoading(false);
        }
      }
    },
    [clearTimers, playUrl, playedSec, playing, selectedUrl, telemetry],
  );

  const switchTrack = useCallback(
    async (step: number) => {
      if (!playable.length) return;
      const currentIdx = playable.findIndex((s) => s.url === selectedUrl);
      const start = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = (start + step + playable.length) % playable.length;
      await handleSelect(playable[nextIdx].url, true);
    },
    [handleSelect, playable, selectedUrl],
  );

  // Publish audio controller + state to the shared cracktro store so the
  // Cracktro overlay can render play/stop/stream chooser controls.
  useEffect(() => {
    setAudioController({
      play: () => { void playSelected(); },
      stop: () => { stopPlayback(); },
      selectStream: (url: string) => { void handleSelect(url, playing); },
    });
    return () => setAudioController(null);
  }, [playSelected, stopPlayback, handleSelect, playing]);

  useEffect(() => {
    setAudioControlState({
      playing,
      loading,
      selectedUrl,
      streams: playable.map((s) => ({ url: s.url, name: s.name })),
    });
  }, [playing, loading, selectedUrl, playable]);


  useEffect(() => {
    if (!stationConfig?.nowPlayingUrl || !playing) return;
    let mounted = true;
    const fetchNowPlaying = async () => {
      try {
        const response = await fetch(stationConfig.nowPlayingUrl, { cache: "no-cache" });
        if (!response.ok) return;
        const payload = await response.json();
        const parsed = parseNowPlayingPayload(stationConfig.nowPlayingFormat, payload);
        if (mounted && parsed) setNowPlaying(parsed);
      } catch {
        // Ignore metadata polling errors
      }
    };
    void fetchNowPlaying();
    const intervalMs = stationConfig.nowPlayingIntervalMs || DEFAULT_NOW_PLAYING_REFRESH_MS;
    const id = window.setInterval(fetchNowPlaying, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [playing, stationConfig]);

  const mediaTitle = nowPlaying?.title || selectedStream?.name || NOW_PLAYING_FALLBACK_TITLE;
  const mediaArtist = nowPlaying?.artist || NOW_PLAYING_FALLBACK_ARTIST;

  // Track song-artwork updates so the MediaSession effect re-runs when the
  // screenshot/platform icon arrives.
  const [songArtworkTick, setSongArtworkTick] = useState(0);
  useEffect(() => {
    if (!currentSongId) return;
    requestSongArtwork(currentSongId);
    const unsub = subscribeSongArtwork(() => setSongArtworkTick((n) => n + 1));
    return () => unsub();
  }, [currentSongId]);

  const lastMetaKeyRef = useRef<string>("");
  useEffect(() => {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    const mediaSession = navigator.mediaSession;
    const fallbackArtwork = new URL(FALLBACK_ARTWORK, window.location.origin).toString();
    const songArtwork = getBestArtworkUrl(currentSongId);
    const primarySrc = resolveArtworkUrl(
      songArtwork || stationConfig?.artworkUrl || selectedStream?.artworkUrl,
      fallbackArtwork,
    );
    const isWsrv = primarySrc.includes("wsrv.nl");
    // Force PNG MIME for wsrv-served artwork and the local app icon (both are
    // PNG). For station artwork URLs we don't control, sniff from the URL.
    const primaryType =
      isWsrv || primarySrc === fallbackArtwork ? "image/png" : inferArtworkType(primarySrc);

    const artwork: MediaImage[] = MEDIA_ARTWORK_SIZES.map((size) => ({
      src: sizedArtworkUrl(primarySrc, size),
      sizes: `${size}x${size}`,
      type: primaryType,
    }));
    // Always advertise the local app icon as a secondary entry so car head
    // units (CarPlay / Android Auto) have a guaranteed-reachable fallback if
    // the primary URL fails to load.
    if (primarySrc !== fallbackArtwork) {
      artwork.push({ src: fallbackArtwork, sizes: "512x512", type: "image/png" });
    }

    const metaKey = `${mediaTitle}|${mediaArtist}|${selectedStream?.name ?? ""}|${primarySrc}`;
    if (metaKey !== lastMetaKeyRef.current) {
      lastMetaKeyRef.current = metaKey;
      mediaSession.metadata = new MediaMetadata({
        title: mediaTitle,
        artist: mediaArtist,
        album: selectedStream?.name || NOW_PLAYING_FALLBACK_ARTIST,
        artwork,
      });
    }
    mediaSession.playbackState = playing ? "playing" : "paused";
    try {
      mediaSession.setPositionState?.();
    } catch {
      // Some browsers do not support clearing MediaSession position state.
    }
  }, [mediaArtist, mediaTitle, playing, selectedStream, stationConfig?.artworkUrl, currentSongId, songArtworkTick]);


  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    const setAction = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Browser may not support every media action.
      }
    };
    setAction("play", () => {
      void playSelected();
    });
    setAction("pause", pausePlayback);
    setAction("stop", stopPlayback);
    setAction("nexttrack", () => {
      void switchTrack(1);
    });
    setAction("previoustrack", () => {
      void switchTrack(-1);
    });
    return () => {
      setAction("play", null);
      setAction("pause", null);
      setAction("stop", null);
      setAction("nexttrack", null);
      setAction("previoustrack", null);
    };
  }, [pausePlayback, playSelected, stopPlayback, switchTrack]);

  const disabled = !selectedUrl;
  const currentLabel = (() => {
    const s = playable.find((x) => x.url === selectedUrl);
    if (!s) return "No stream";
    return `${s.name}${s.bitrate ? ` · ${s.bitrate}kbps` : ""}`;
  })();

  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!volumeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setVolumeOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [volumeOpen]);

  return (
    <div className="panel !p-2 relative" style={{ zIndex: 70 }}>
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-label={playing ? "Pause stream" : "Play stream"}
          className="h-10 w-10 shrink-0 flex items-center justify-center bg-primary text-primary-foreground rounded-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
          style={{ boxShadow: disabled ? undefined : "var(--glow-primary)" }}
        >
          {loading ? (
            <span className="text-xs">…</span>
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        <select
          value={selectedUrl ?? ""}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={playable.length === 0}
          aria-label="Select stream"
          className="flex-1 min-w-0 h-10 bg-background/60 border border-border text-foreground text-xs px-2 rounded-sm focus:outline-none focus:border-primary touch-manipulation"
          title={currentLabel}
        >
          {playable.length === 0 && <option value="">No streams</option>}
          {playable.map((s) => (
            <option key={s.url} value={s.url}>
              {s.name}
              {s.bitrate ? ` · ${s.bitrate}kbps` : ""}
            </option>
          ))}
        </select>

        <div ref={volumeRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setVolumeOpen((o) => !o)}
            aria-label="Volume"
            aria-expanded={volumeOpen}
            className="h-10 w-10 flex items-center justify-center border border-border rounded-sm hover:border-primary transition-colors touch-manipulation"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          {volumeOpen && (
            <div className="absolute right-0 top-full mt-1 z-[100] bg-card border border-border rounded-sm p-2 flex flex-col items-center gap-2 shadow-lg">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  setVolume(v);
                  if (v > 0 && muted) setMuted(false);
                }}
                aria-label="Volume"
                className="accent-primary touch-manipulation"
                style={{
                  writingMode: "vertical-lr" as CSSProperties["writingMode"],
                  WebkitAppearance: "slider-vertical",
                  width: "1.5rem",
                  height: "8rem",
                }}
              />
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs mt-1.5 break-words px-1">
        <span className="text-muted-foreground">
          {reconnecting ? "↻ Reconnecting… " : playing ? "● " : ""}Now:{" "}
        </span>
        <span className="font-semibold">{mediaTitle}</span>
        <span className="text-muted-foreground"> — {mediaArtist}</span>
        {playing && bufferedAhead > 0 && (
          <span className="text-muted-foreground"> · buf: {Math.round(bufferedAhead)}s</span>
        )}
      </p>
      {error && <p className="text-xs text-destructive mt-0.5 px-1">{error}</p>}

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => {
          logPlayback("info", "media", "onPlay", snapshot());
          setPlaying(true);
          if (reconnectingRef.current) wasReconnectingRef.current = true;
          setReconnecting(false);
          markPlaybackAlive();
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
        }}
        onPause={() => {
          logPlayback("info", "media", "onPause", snapshot());
          setPlaying(false);
        }}
        onEnded={() => {
          logPlayback("warn", "media", "onEnded", snapshot());
          setPlaying(false);
          const el = audioRef.current;
          telemetry("ended", {
            reason: "media-ended",
            network_state: el?.networkState ?? null,
            ready_state: el?.readyState ?? null,
            played_sec: playedSec(),
          });
          if (shouldPlayRef.current) attemptRecovery({ force: true, reason: "media-ended" });
        }}
        onError={(e) => {
          const el = e.currentTarget;
          const mediaErr = el.error;
          logPlayback("error", "media", "onError", snapshot({
            code: mediaErr?.code,
            message: mediaErr?.message,
          }));
          setPlaying(false);
          setLoading(false);
          telemetry("error", {
            reason: `media-error-${mediaErr?.code ?? "unknown"}`,
            media_error_code: mediaErr?.code ?? null,
            media_error_message: mediaErr?.message ?? null,
            network_state: el.networkState ?? null,
            ready_state: el.readyState ?? null,
            played_sec: playedSec(),
          });
          if (shouldPlayRef.current) {
            const code = mediaErr?.code ?? 0;
            const currentUrl = selectedUrl;
            // A second NETWORK error (code 2) on the same desktop stream within
            // the failover cooldown usually means the current path is broken
            // (e.g. a VPN resetting the socket). Fail the stream and move on
            // instead of force-reloading the same URL forever.
            if (code === 2 && !IS_MOBILE && currentUrl) {
              const lastCode2 = lastCode2AtRef.current.get(currentUrl) ?? 0;
              if (Date.now() - lastCode2 < FAILOVER_COOLDOWN_MS) {
                failedStreamsRef.current.set(currentUrl, Date.now());
                const nextUrl = pickNextStream(currentUrl);
                if (nextUrl && nextUrl !== currentUrl) {
                  logPlayback("warn", "media", "desktop code-2 repeated → failover", {
                    from: currentUrl,
                    to: nextUrl,
                  });
                  telemetry("failover", {
                    reason: `vpn-code2: ${currentUrl} -> ${nextUrl}`,
                    played_sec: playedSec(),
                  });
                  retryCountRef.current = 0;
                  setSelectedUrl(nextUrl);
                  setNowPlaying(null);
                  setReconnecting(true);
                  retryTimerRef.current = window.setTimeout(() => {
                    playUrl(nextUrl, true).catch(() =>
                      attemptRecovery({ reason: "vpn-code2-failover" }),
                    );
                  }, 500);
                  return;
                }
              }
              lastCode2AtRef.current.set(currentUrl, Date.now());
            }
            // 2 NETWORK / 3 DECODE / 4 SRC_NOT_SUPPORTED mean the socket is
            // dead (typical of a wifi↔cellular handover) — force a reload.
            // 1 ABORTED is usually just a superseded load.
            if (code === 2 || code === 3 || code === 4) {
              attemptRecovery({ force: true, reason: `media-error-${code}` });
            } else {
              attemptRecovery({ reason: `media-error-${code}` });
            }
          } else {
            setError("Stream error");
          }
        }}
        onWaiting={() => {
          logPlayback("warn", "media", "onWaiting", snapshot());
          scheduleStallCheck("waiting");
        }}
        onStalled={() => {
          logPlayback("warn", "media", "onStalled", snapshot());
          scheduleStallCheck("stalled");
        }}
        onPlaying={() => {
          logPlayback("info", "media", "onPlaying", snapshot());
          markPlaybackAlive();
          const el = audioRef.current;
          if (playStartedAtRef.current === null) playStartedAtRef.current = Date.now();
          if (!connectOkSentRef.current) {
            connectOkSentRef.current = true;
            playStartedAtRef.current = Date.now();
            telemetry("connect_ok", {
              network_state: el?.networkState ?? null,
              ready_state: el?.readyState ?? null,
            });
          }
          if (stablePlaybackTimerRef.current !== null) {
            window.clearTimeout(stablePlaybackTimerRef.current);
            stablePlaybackTimerRef.current = null;
          }
          stablePlaybackTimerRef.current = window.setTimeout(() => {
            stablePlaybackTimerRef.current = null;
            const audio = audioRef.current;
            if (shouldPlayRef.current && audio && !audio.paused) {
              retryCountRef.current = 0;
            }
          }, 10_000);
          if (wasReconnectingRef.current || reconnectingRef.current) {
            wasReconnectingRef.current = false;
            reconnectingRef.current = false;
            telemetry("recovered", {
              reason: lastRecoveryReasonRef.current ?? "unknown",
              network_state: el?.networkState ?? null,
              ready_state: el?.readyState ?? null,
              played_sec: playedSec(),
            });
            lastRecoveryReasonRef.current = null;
          }
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          notePlaybackProgress(el);
          setPlayerTime(el.currentTime || 0, 0);
        }}
        onDurationChange={(e) => {
          const el = e.currentTarget;
          setPlayerTime(el.currentTime || 0, 0);
        }}
      />
    </div>
  );
};

export default AudioPlayer;
