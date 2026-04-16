import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { StreamSource } from "@/lib/nectarine";

type Props = {
  streams: StreamSource[];
  onAnalyserReady?: (analyser: AnalyserNode) => void;
};

const AudioPlayer = ({ streams, onAnalyserReady }: Props) => {
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

  const ensureAudioGraph = () => {
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
  };

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || !selectedUrl) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    try {
      setError(null);
      setLoading(true);
      ensureAudioGraph();
      a.src = selectedUrl;
      a.crossOrigin = "anonymous";
      await a.play();
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  // Switch stream while playing
  const handleSelect = async (url: string) => {
    setSelectedUrl(url);
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      try {
        setLoading(true);
        a.pause();
        a.src = url;
        await a.play();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Stream switch failed");
        setPlaying(false);
      } finally {
        setLoading(false);
      }
    }
  };

  const disabled = !selectedUrl;
  const currentLabel = (() => {
    const s = playable.find((x) => x.url === selectedUrl);
    if (!s) return "No stream";
    return `${s.name}${s.bitrate ? ` · ${s.bitrate}kbps` : ""}`;
  })();

  return (
    <div className="panel !p-3 flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={playing ? "Pause stream" : "Play stream"}
        className="h-10 w-10 flex items-center justify-center bg-primary text-primary-foreground rounded-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
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

      <div className="flex-1 min-w-[180px]">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {playing ? "● Live" : "Stream"}
        </p>
        <select
          value={selectedUrl ?? ""}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={playable.length === 0}
          aria-label="Select stream"
          className="w-full bg-background/60 border border-border text-foreground text-sm px-2 py-1 rounded-sm focus:outline-none focus:border-primary mt-0.5"
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
        {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="h-8 w-8 flex items-center justify-center border border-border rounded-sm hover:border-primary transition-colors"
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
          className="w-24 accent-primary"
        />
      </div>

      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
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
