import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { StreamSource } from "@/lib/nectarine";
import { parseNowPlayingPayload, type NowPlayingTrack } from "@/lib/nowPlaying";

type Props = {
  streams: StreamSource[];
  currentTrack?: { artist: string; song: string } | null;
  onAnalyserReady?: (analyser: AnalyserNode) => void;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const proxiedUrl = (url: string) =>
  `${SUPABASE_URL}/functions/v1/audio-proxy?url=${encodeURIComponent(url)}`;

type StationNowPlayingConfig = {
  nowPlayingUrl: string;
  nowPlayingFormat?: string;
  artworkUrl?: string;
};

const STATION_NOW_PLAYING_BY_URL: Record<string, StationNowPlayingConfig> = {};

const NOW_PLAYING_REFRESH_MS = 20_000;

const AudioPlayer = ({ streams, currentTrack, onAnalyserReady }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const playable = useMemo(
    () => streams.filter((s) => s.url.startsWith("https://")),
    [streams],
  );

  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);

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

  const selectedStream = useMemo(
    () => playable.find((x) => x.url === selectedUrl) ?? null,
    [playable, selectedUrl],
  );

  const stationConfig = useMemo(() => {
    if (!selectedStream?.url) return null;
    const fromStream = selectedStream.nowPlayingUrl
      ? {
          nowPlayingUrl: selectedStream.nowPlayingUrl,
          nowPlayingFormat: selectedStream.nowPlayingFormat || "azuracast",
          artworkUrl: selectedStream.artworkUrl,
        }
      : null;
    return fromStream ?? STATION_NOW_PLAYING_BY_URL[selectedStream.url] ?? null;
  }, [selectedStream]);

  useEffect(() => {
    if (currentTrack?.song || currentTrack?.artist) {
      setNowPlaying({
        artist: (currentTrack.artist || "Nectarine Radio").trim(),
        title: (currentTrack.song || selectedStream?.name || "Live Stream").trim(),
      });
    }
  }, [currentTrack, selectedStream?.name]);

  const ensureAudioGraph = useCallback(() => {
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

  const playSelected = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !selectedUrl) return;
    try {
      setError(null);
      setLoading(true);
      ensureAudioGraph();
      a.crossOrigin = "anonymous";
      const target = proxiedUrl(selectedUrl);
      if (a.src !== target) a.src = target;
      await a.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
    } finally {
      setLoading(false);
    }
  }, [ensureAudioGraph, selectedUrl]);

  const pausePlayback = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
  }, []);

  const stopPlayback = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.removeAttribute("src");
    a.load();
  }, []);

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
      setSelectedUrl(url);
      setError(null);
      const a = audioRef.current;
      if (!a) return;
      setNowPlaying(null);
      if (autoplay) {
        try {
          setLoading(true);
          if (!a.paused) a.pause();
          a.src = proxiedUrl(url);
          await a.play();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Stream switch failed");
        } finally {
          setLoading(false);
        }
      }
    },
    [playing],
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

  useEffect(() => {
    if (!stationConfig?.nowPlayingUrl || !playing) return;
    let mounted = true;
    const fetchNowPlaying = async () => {
      try {
        const response = await fetch(stationConfig.nowPlayingUrl, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        const parsed = parseNowPlayingPayload(stationConfig.nowPlayingFormat, payload);
        if (mounted && parsed) setNowPlaying(parsed);
      } catch {
        // Ignore metadata polling errors
      }
    };
    void fetchNowPlaying();
    const id = window.setInterval(fetchNowPlaying, NOW_PLAYING_REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [playing, stationConfig]);

  const mediaTitle = nowPlaying?.title || selectedStream?.name || "Nectarine Radio";
  const mediaArtist = nowPlaying?.artist || "Nectarine Radio";

  useEffect(() => {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    const mediaSession = navigator.mediaSession;
    const fallbackArtwork = new URL("/placeholder.svg", window.location.origin).toString();
    const artworkSrc = selectedStream?.artworkUrl
      ? new URL(selectedStream.artworkUrl, window.location.href).toString()
      : fallbackArtwork;
    mediaSession.metadata = new MediaMetadata({
      title: mediaTitle,
      artist: mediaArtist,
      album: selectedStream?.name || "Nectarine Radio",
      artwork: [96, 192, 256, 384, 512].map((size) => ({
        src: artworkSrc,
        sizes: `${size}x${size}`,
        type: "image/svg+xml",
      })),
    });
    mediaSession.playbackState = playing ? "playing" : "paused";
  }, [mediaArtist, mediaTitle, playing, selectedStream]);

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

  return (
    <div className="panel !p-3 flex items-center gap-3 flex-wrap overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={playing ? "Pause stream" : "Play stream"}
        className="h-12 w-12 shrink-0 flex items-center justify-center bg-primary text-primary-foreground rounded-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
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

      <div className="flex-1 min-w-[220px]">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {playing ? "● Live" : "Stream"}
        </p>
        <select
          value={selectedUrl ?? ""}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={playable.length === 0}
          aria-label="Select stream"
          className="w-full min-h-11 bg-background/60 border border-border text-foreground text-base px-3 py-2 rounded-sm focus:outline-none focus:border-primary mt-0.5 touch-manipulation"
          title={currentLabel}
        >
          {playable.length === 0 && <option value="">No streams</option>}
          {playable.map((s) => (
            <option key={s.url} value={s.url}>
              {s.name}
              {s.bitrate ? ` · ${s.bitrate}kbps` : ""}
              {s.type ? ` · ${s.type}` : ""}
            </option>
          ))}
        </select>
        <p className="text-sm mt-2 break-words">
          <span className="text-muted-foreground">Now: </span>
          <span className="font-semibold">{mediaTitle}</span>
          <span className="text-muted-foreground"> — {mediaArtist}</span>
        </p>
        {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
      </div>

      <div className="flex items-center gap-2 min-w-[132px]">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="h-11 w-11 flex items-center justify-center border border-border rounded-sm hover:border-primary transition-colors touch-manipulation"
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
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
          className="w-24 h-11 accent-primary touch-manipulation"
        />
      </div>

      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setError("Stream error");
          setPlaying(false);
          setLoading(false);
        }}
      />
    </div>
  );
};

export default AudioPlayer;
