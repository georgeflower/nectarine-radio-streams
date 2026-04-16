import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

type Props = {
  src: string | null;
  label?: string;
};

const AudioPlayer = ({ src, label }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  // Sync volume/mute to element
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted]);

  // Reset on src change
  useEffect(() => {
    setPlaying(false);
    setError(null);
    setLoading(false);
  }, [src]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || !src) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    try {
      setError(null);
      setLoading(true);
      // Force reload to avoid stale buffer on streams
      a.src = src;
      await a.play();
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const disabled = !src;

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

      <div className="flex-1 min-w-[140px]">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {playing ? "● Live" : "Stream"}
        </p>
        <p className="text-sm neon-accent truncate" title={label ?? src ?? ""}>
          {label ?? (src ? src : "No stream available")}
        </p>
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
