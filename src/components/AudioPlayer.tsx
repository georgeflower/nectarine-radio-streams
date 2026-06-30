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

type Props = {
  streams: StreamSource[];
  currentTrack?: { artist: string; song: string } | null;
  currentSongId?: string;
  onAnalyserReady?: (analyser: AnalyserNode) => void;
  onSeek?: () => void;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const proxiedUrl = (url: string, cacheBust = false) =>
  `${SUPABASE_URL}/functions/v1/audio-proxy?url=${encodeURIComponent(url)}${cacheBust ? `&t=${Date.now()}` : ""}`;

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const STALL_TIMEOUT_MS = 30_000;
const FAILOVER_COOLDOWN_MS = 60_000;
const BUFFER_POLL_MS = 2000;

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


const AudioPlayer = ({ streams, currentTrack, currentSongId, onAnalyserReady, onSeek }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferedStreamRef = useRef<BufferedStreamHandle | null>(null);

  const playable = useMemo(
    () =>
      streams
        .filter((s) => /^https?:\/\//i.test(s.url))
        .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)),
    [streams],
  );

  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [bufferedAhead, setBufferedAhead] = useState(0);

  const shouldPlayRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const failedStreamsRef = useRef<Map<string, number>>(new Map());
  const attemptRecoveryRef = useRef<(() => void) | null>(null);

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
      if (bufferedStreamRef.current) {
        bufferedStreamRef.current.cleanup();
        bufferedStreamRef.current = null;
      }
    };
  }, []);

  // Background-resume watchdog: when the tab becomes visible again,
  // when the device wakes (pageshow), or when the network returns,
  // kick playback back to life if we should be playing but the
  // <audio> element has stalled or been paused by the OS.
  useEffect(() => {
    const wake = () => {
      if (!shouldPlayRef.current) return;
      const a = audioRef.current;
      if (!a) return;
      // Cancel a stall timer that fired while we were hidden — the OS
      // pauses background timers so it's unreliable.
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      if (a.paused || a.readyState < 2) {
        attemptRecoveryRef.current?.();
      } else {
        // Element thinks it's playing — nudge it.
        a.play().catch(() => attemptRecoveryRef.current?.());
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, []);


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
  } | null>(null);
  useEffect(() => {
    if (!getLastfmSession()) return;
    const artist = normalizeNowPlayingValue(currentTrack?.artist);
    const track = normalizeNowPlayingValue(currentTrack?.song);
    if (!artist || !track) return;
    const key = currentSongId || `${artist}::${track}`;
    if (scrobbleStateRef.current?.songId === key) return;
    scrobbleStateRef.current = {
      songId: key,
      startedAt: Math.floor(Date.now() / 1000),
      scrobbled: false,
      artist,
      track,
    };
    void sendNowPlaying(artist, track);
  }, [currentTrack, currentSongId]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = scrobbleStateRef.current;
      if (!s || s.scrobbled) return;
      if (!getLastfmSession()) return;
      const a = audioRef.current;
      const played = Math.floor(Date.now() / 1000) - s.startedAt;
      const dur = a && isFinite(a.duration) && a.duration > 30 ? a.duration : 0;
      const threshold = dur > 0 ? Math.min(240, dur / 2) : 240;
      if (played >= threshold) {
        s.scrobbled = true;
        void sendScrobble(s.artist, s.track, s.startedAt, dur || undefined);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [playing]);

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
  }, []);

  const playUrl = useCallback(
    async (url: string, cacheBust = false) => {
      const a = audioRef.current;
      if (!a) return;
      ensureAudioGraph();
      a.crossOrigin = "anonymous";
      a.preload = "auto";
      a.setAttribute("playsinline", "");
      const target = proxiedUrl(url, cacheBust);

      // Tear down any prior buffered stream before switching
      if (bufferedStreamRef.current) {
        bufferedStreamRef.current.cleanup();
        bufferedStreamRef.current = null;
      }

      // MSE-fed playback is throttled when the tab is hidden and not
      // supported well on iOS. Use native <audio> src on mobile so the
      // browser's media stack handles background buffering.
      const canUseMse =
        !IS_MOBILE &&
        isMseAudioSupported() &&
        (typeof document === "undefined" || document.visibilityState === "visible");
      if (canUseMse) {
        bufferedStreamRef.current = attachBufferedStream(a, target, { targetBufferSec: 30 });
      } else {
        if (a.src !== target) a.src = target;
      }
      await a.play();
    },
    [ensureAudioGraph],
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
      const available = playable.filter((s) => {
        const failedAt = failedStreamsRef.current.get(s.url);
        return !failedAt || now - failedAt > FAILOVER_COOLDOWN_MS;
      });
      const pool = available.length > 0 ? available : playable;
      const idx = pool.findIndex((s) => s.url === currentUrl);
      const next = pool[(idx + 1) % pool.length];
      return next?.url ?? null;
    },
    [playable],
  );

  const attemptRecovery = useCallback(() => {
    if (!shouldPlayRef.current) return;
    clearTimers();
    const currentUrl = selectedUrl;
    if (!currentUrl) return;

    if (retryCountRef.current < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[retryCountRef.current] ?? 4000;
      retryCountRef.current += 1;
      setReconnecting(true);
      setError(null);
      retryTimerRef.current = window.setTimeout(() => {
        playUrl(currentUrl, true).catch(() => attemptRecovery());
      }, delay);
      return;
    }

    failedStreamsRef.current.set(currentUrl, Date.now());
    const nextUrl = pickNextStream(currentUrl);
    if (!nextUrl || nextUrl === currentUrl) {
      setReconnecting(false);
      setError("All streams unavailable");
      shouldPlayRef.current = false;
      return;
    }
    retryCountRef.current = 0;
    setSelectedUrl(nextUrl);
    setNowPlaying(null);
    setReconnecting(true);
    retryTimerRef.current = window.setTimeout(() => {
      playUrl(nextUrl, true).catch(() => attemptRecovery());
    }, 500);
  }, [clearTimers, pickNextStream, playUrl, selectedUrl]);
  useEffect(() => { attemptRecoveryRef.current = attemptRecovery; }, [attemptRecovery]);

  const pausePlayback = useCallback(() => {
    shouldPlayRef.current = false;
    clearTimers();
    setReconnecting(false);
    const a = audioRef.current;
    if (!a) return;
    a.pause();
  }, [clearTimers]);

  const stopPlayback = useCallback(() => {
    shouldPlayRef.current = false;
    clearTimers();
    setReconnecting(false);
    if (bufferedStreamRef.current) {
      bufferedStreamRef.current.cleanup();
      bufferedStreamRef.current = null;
    }
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.removeAttribute("src");
    a.load();
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
    [clearTimers, playUrl, playing],
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
        crossOrigin="anonymous"
        onPlay={() => {
          setPlaying(true);
          setReconnecting(false);
          retryCountRef.current = 0;
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (shouldPlayRef.current) attemptRecovery();
        }}
        onError={() => {
          setPlaying(false);
          setLoading(false);
          if (shouldPlayRef.current) {
            attemptRecovery();
          } else {
            setError("Stream error");
          }
        }}
        onWaiting={() => {
          if (!shouldPlayRef.current) return;
          if (stallTimerRef.current !== null) return;
          if (typeof document !== "undefined" && document.hidden) return;
          stallTimerRef.current = window.setTimeout(() => {
            stallTimerRef.current = null;
            if (shouldPlayRef.current) attemptRecovery();
          }, STALL_TIMEOUT_MS);
        }}
        onStalled={() => {
          if (!shouldPlayRef.current) return;
          if (stallTimerRef.current !== null) return;
          if (typeof document !== "undefined" && document.hidden) return;
          stallTimerRef.current = window.setTimeout(() => {
            stallTimerRef.current = null;
            if (shouldPlayRef.current) attemptRecovery();
          }, STALL_TIMEOUT_MS);
        }}
        onPlaying={() => {
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
        }}
        onSeeked={() => {
          onSeek?.();
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setPlayerTime(el.currentTime || 0, Number.isFinite(el.duration) ? el.duration : 0);
        }}
        onDurationChange={(e) => {
          const el = e.currentTarget;
          setPlayerTime(el.currentTime || 0, Number.isFinite(el.duration) ? el.duration : 0);
        }}
      />
    </div>
  );
};

export default AudioPlayer;
