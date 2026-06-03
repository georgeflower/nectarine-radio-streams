import { useEffect, useMemo, useRef, useState } from "react";
import Visualizer, { type VisualizerStyle } from "./Visualizer";
import BeatOverlay from "./BeatOverlay";
import { getCachedInfo, requestInfo, subscribe as subscribeEntities } from "@/lib/entityCache";

type Props = {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
  artist: string;
  title: string;
  songId?: string;
  onExit: () => void;
  onStyleChange?: (s: VisualizerStyle) => void;
};

const VIZ_STYLES: { id: VisualizerStyle; label: string }[] = [
  { id: "starfield", label: "Starfield" },
  { id: "bars", label: "Bars" },
  { id: "plasma", label: "Plasma" },
  { id: "oscilloscope", label: "Scope" },
  { id: "tunnel", label: "Tunnel" },
  { id: "rings", label: "Rings" },
  { id: "particles", label: "Particles" },
];

type ScrollMode =
  | "sinus"
  | "bouncy"
  | "zoomer"
  | "wobble"
  | "copper"
  | "vector"
  | "infobar";

const MODES: { id: ScrollMode; label: string }[] = [
  { id: "sinus", label: "Sinus" },
  { id: "bouncy", label: "Bouncy" },
  { id: "zoomer", label: "Zoomer" },
  { id: "wobble", label: "Wobble" },
  { id: "copper", label: "Copper" },
  { id: "vector", label: "Vector" },
  { id: "infobar", label: "Info Bar" },
];

const STORAGE_MODE = "cracktro-scroll-mode";
const STORAGE_ON = "cracktro-scroll-on";

const Cracktro = ({ analyser, style, artist, title, songId, onExit, onStyleChange }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const [scrollOn, setScrollOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ON) !== "0";
    } catch {
      return true;
    }
  });
  const [mode, setMode] = useState<ScrollMode>(() => {
    try {
      const v = localStorage.getItem(STORAGE_MODE) as ScrollMode | null;
      if (v && MODES.some((m) => m.id === v)) return v;
    } catch {
      // ignore
    }
    return "sinus";
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_ON, scrollOn ? "1" : "0"); } catch { /* ignore */ }
  }, [scrollOn]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_MODE, mode); } catch { /* ignore */ }
  }, [mode]);

  // Auto-hide UI (exit + controls) after 5s of no pointer activity.
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const reveal = () => {
      setShowControls(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setShowControls(false), 5000);
    };
    reveal();
    window.addEventListener("mousemove", reveal);
    window.addEventListener("touchstart", reveal, { passive: true });
    window.addEventListener("keydown", reveal);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      window.removeEventListener("mousemove", reveal);
      window.removeEventListener("touchstart", reveal);
      window.removeEventListener("keydown", reveal);
    };
  }, []);

  // Pull song info (platform/rating) from the entity cache.
  const [info, setInfo] = useState(() => (songId ? getCachedInfo("song", songId) : undefined));
  useEffect(() => {
    if (!songId) { setInfo(undefined); return; }
    setInfo(getCachedInfo("song", songId));
    requestInfo("song", songId);
    const unsub = subscribeEntities(() => setInfo(getCachedInfo("song", songId)));
    return unsub;
  }, [songId]);
  const platform = info?.platformName ?? "";
  const rating = typeof info?.rating === "number" ? info.rating : undefined;
  const votes = info?.votes;

  // Request browser fullscreen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const req = (el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    }).requestFullscreen ?? (el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    }).webkitRequestFullscreen;
    let entered = false;
    Promise.resolve(req?.call(el))
      .then(() => { entered = !!document.fullscreenElement; })
      .catch(() => { /* ignore */ });

    const onFsChange = () => {
      if (entered && !document.fullscreenElement) onExitRef.current();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, []);

  // Esc handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const text = useMemo(() => (
    `   NOW SPINNING:  ${(artist || "UNKNOWN ARTIST").toUpperCase()}  ---  ${(title || "UNKNOWN TUNE").toUpperCase()}` +
    `${platform ? `   ON  ${platform.toUpperCase()}` : ""}` +
    `${rating !== undefined ? `   ★ ${rating.toFixed(2)}` : ""}` +
    `   ***   STAY TUNED TO NECTARINE DEMOSCENE RADIO   ***   GREETZ TO ALL THE SCENERS OUT THERE   ***   PRESS ESC TO RETURN TO REALITY   ***   `
  ), [artist, title, platform, rating]);

  // Scroller canvas — modes: sinus / bouncy / zoomer / wobble / copper / vector.
  useEffect(() => {
    if (!scrollOn || mode === "infobar") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Tall enough that wave displacement + glyph + shadow blur never clips.
    const CSS_H = 360;

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(CSS_H * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${CSS_H}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const fontSize = 64 * dpr;
    const fontStr = `900 ${fontSize}px "Impact","Arial Black","Helvetica Neue",sans-serif`;
    ctx.font = fontStr;
    ctx.textBaseline = "middle";
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width + 4 * dpr);
    const totalW = widths.reduce((a, b) => a + b, 0);

    let offset = 0;
    let t = 0;
    let raf = 0;

    const drawBackdrop = (w: number, h: number) => {
      if (mode === "copper") {
        // Copper bar gradient bands (Amiga style).
        const bandH = 6 * dpr;
        for (let y = 0; y < h; y += bandH) {
          const phase = (y * 0.02 + t * 1.4);
          const v = (Math.sin(phase) + 1) * 0.5;
          const hue = (y * 0.7 + t * 80) % 360;
          ctx.fillStyle = `hsla(${hue}, 95%, ${20 + v * 35}%, 0.55)`;
          ctx.fillRect(0, y, w, bandH);
        }
      } else {
        ctx.fillStyle = "hsla(20, 25%, 6%, 0.45)";
        ctx.fillRect(0, 0, w, h);
      }
    };

    const tick = () => {
      ctx.font = fontStr;
      ctx.textBaseline = "middle";
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      drawBackdrop(w, h);

      const cy = h / 2;
      // Keep amplitude well within the canvas so glyphs never clip.
      const amp = Math.min(h * 0.22, 80 * dpr);

      if (w - offset + totalW < 0) offset = 0;

      let x = w - offset;
      for (let i = 0; i < chars.length; i++) {
        const cw = widths[i];
        if (x + cw < 0) { x += cw; continue; }
        if (x > w) break;

        // Per-mode glyph transform.
        let y = cy;
        let scale = 1;
        let rotation = 0;
        let skewY = 0;

        switch (mode) {
          case "sinus": {
            const phase = x * 0.006 - t * 2.2;
            y = cy + Math.sin(phase) * amp;
            break;
          }
          case "bouncy": {
            // Each glyph bobs in lockstep cascade (classic intro look).
            const phase = i * 0.45 - t * 4.5;
            y = cy + Math.abs(Math.sin(phase)) * -amp + amp * 0.4;
            break;
          }
          case "zoomer": {
            const phase = x * 0.004 - t * 2.0;
            y = cy + Math.sin(phase) * (amp * 0.45);
            scale = 1 + Math.sin(phase * 1.3) * 0.35;
            break;
          }
          case "wobble": {
            // Two-frequency interference wave.
            const a = Math.sin(x * 0.005 - t * 2.4);
            const b = Math.sin(x * 0.013 + t * 1.1);
            y = cy + (a * 0.6 + b * 0.4) * amp;
            rotation = (a - b) * 0.18;
            break;
          }
          case "copper": {
            const phase = x * 0.007 - t * 2.6;
            y = cy + Math.sin(phase) * amp * 0.55;
            break;
          }
          case "vector": {
            // Atari-style vector tilt — sheared italic skew + gentle bob.
            const phase = x * 0.005 - t * 1.8;
            y = cy + Math.sin(phase) * amp * 0.5;
            skewY = Math.sin(phase * 0.7) * 0.35;
            scale = 0.95 + Math.cos(phase) * 0.15;
            break;
          }
        }

        const hue = (x * 0.4 + t * 60) % 360;
        ctx.save();
        ctx.translate(x + cw / 2, y);
        if (rotation) ctx.rotate(rotation);
        if (skewY) ctx.transform(1, skewY, -0.25, 1, 0, 0);
        if (scale !== 1) ctx.scale(scale, scale);
        ctx.shadowColor = `hsl(${hue}, 100%, 55%)`;
        ctx.shadowBlur = 18 * dpr;
        ctx.fillStyle = `hsl(${hue}, 100%, 68%)`;
        ctx.fillText(chars[i], -cw / 2 + 2 * dpr, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = `hsl(${(hue + 30) % 360}, 100%, 88%)`;
        ctx.fillText(chars[i], -cw / 2 + 2 * dpr, -2 * dpr);
        ctx.restore();

        x += cw;
      }

      offset += 3 * dpr;
      t += 0.05;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [text, mode, scrollOn]);

  const scrollerBottomOffset = 40; // px, leaves room for the controls bar

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[9999] bg-background overflow-hidden"
    >
      <Visualizer analyser={analyser} style={style === "off" ? "tunnel" : style} />
      <BeatOverlay analyser={analyser} enabled />

      {/* Scroller canvas — vertically centered, taller box so glyphs never clip. */}
      {scrollOn && mode !== "infobar" && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: "50%", transform: "translateY(-50%)", zIndex: 5 }}
        />
      )}

      {/* Info-bar mode: big now-playing strip pinned to the bottom. */}
      {scrollOn && mode === "infobar" && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            bottom: scrollerBottomOffset,
            zIndex: 5,
            background: "linear-gradient(to top, hsla(20,25%,4%,0.85), hsla(20,25%,4%,0))",
            paddingTop: "1.5rem",
            paddingBottom: "1.5rem",
          }}
        >
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p
              className="neon font-extrabold uppercase leading-tight tracking-wider"
              style={{ fontSize: "clamp(2rem, 5.5vw, 5rem)" }}
            >
              {title || "Unknown Tune"}
            </p>
            <p
              className="neon-accent font-bold uppercase tracking-widest mt-2"
              style={{ fontSize: "clamp(1.25rem, 3vw, 2.5rem)" }}
            >
              by {artist || "Unknown Artist"}
            </p>
            {(platform || rating !== undefined) && (
              <p
                className="text-foreground uppercase tracking-[0.3em] mt-3"
                style={{ fontSize: "clamp(0.95rem, 1.8vw, 1.5rem)" }}
              >
                {platform && <span>{platform}</span>}
                {platform && rating !== undefined && <span className="mx-3 opacity-50">·</span>}
                {rating !== undefined && (
                  <span>★ {rating.toFixed(2)}{votes ? ` (${votes})` : ""}</span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top-right exit. */}
      <button
        type="button"
        onClick={onExit}
        className="absolute top-4 right-4 min-h-11 px-3 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/80 text-foreground hover:bg-card hover:opacity-90 touch-manipulation"
        style={{ zIndex: 10 }}
        aria-label="Exit fullscreen cracktro"
      >
        Exit ✕
      </button>

      {/* Bottom controls bar: scroll on/off + mode picker. */}
      <div
        className="absolute left-0 right-0 bottom-0 flex flex-wrap items-center justify-center gap-2 px-3 py-2 bg-card/70 border-t border-border backdrop-blur-sm"
        style={{ zIndex: 11 }}
      >
        <button
          type="button"
          onClick={() => setScrollOn((v) => !v)}
          className="min-h-9 px-3 py-1 text-[10px] uppercase tracking-widest rounded-sm border border-border bg-background/60 text-foreground hover:bg-background"
          aria-pressed={scrollOn}
        >
          Scroller: {scrollOn ? "ON" : "OFF"}
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { setMode(m.id); if (!scrollOn) setScrollOn(true); }}
              disabled={!scrollOn}
              className={`min-h-9 px-2 py-1 text-[10px] uppercase tracking-widest rounded-sm border ${
                mode === m.id
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
              } ${!scrollOn ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground ml-2">
          ESC to exit
        </span>
      </div>
    </div>
  );
};

export default Cracktro;
