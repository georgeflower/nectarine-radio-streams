import { useEffect, useRef } from "react";
import Visualizer, { type VisualizerStyle } from "./Visualizer";
import BeatOverlay from "./BeatOverlay";

type Props = {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
  artist: string;
  title: string;
  onExit: () => void;
};

/**
 * Fullscreen "cracktro" style overlay: the active visualizer fills the
 * screen behind a classic Amiga-style sinus scroller that announces the
 * current artist and song title.
 */
const Cracktro = ({ analyser, style, artist, title, onExit }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  // Request browser fullscreen when mounted, release on unmount.
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
      .then(() => {
        entered = !!document.fullscreenElement;
      })
      .catch(() => {
        // ignore — overlay still works without true fullscreen
      });

    const onFsChange = () => {
      // Only exit when we actually entered fullscreen and the user left it.
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

  // Esc handler (works even outside the browser's native fullscreen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sinus scroller.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(160 * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `160px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const text = `   *** GREETINGS FROM QUMRAN ***   NOW SPINNING:  ${(artist || "UNKNOWN ARTIST").toUpperCase()}  ---  ${(title || "UNKNOWN TUNE").toUpperCase()}   ***   STAY TUNED TO NECTARINE DEMOSCENE RADIO   ***   PRESS ESC TO RETURN TO REALITY   ***   `;
    const fontSize = 64 * dpr;
    ctx.font = `900 ${fontSize}px "Impact","Arial Black","Helvetica Neue",sans-serif`;
    ctx.textBaseline = "middle";
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width + 4 * dpr);
    const totalW = widths.reduce((a, b) => a + b, 0);

    let offset = 0;
    let t = 0;
    let raf = 0;

    const tick = () => {
      // re-set the font in case dpr/font fallback changed.
      ctx.font = `900 ${fontSize}px "Impact","Arial Black","Helvetica Neue",sans-serif`;
      ctx.textBaseline = "middle";
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // Light translucent band so text stays readable over the visualizer.
      ctx.fillStyle = "hsla(20, 25%, 6%, 0.45)";
      ctx.fillRect(0, 0, w, h);

      const cy = h / 2;
      const amp = h * 0.22;
      let x = w - (offset % totalW);
      for (let i = 0; i < chars.length * 2; i++) {
        const idx = i % chars.length;
        const cw = widths[idx];
        if (x + cw < 0) {
          x += cw;
          continue;
        }
        if (x > w) break;
        const y = cy + Math.sin(x * 0.012 + t) * amp;
        const hue = (x * 0.4 + t * 60) % 360;
        ctx.shadowColor = `hsl(${hue}, 100%, 55%)`;
        ctx.shadowBlur = 18 * dpr;
        ctx.fillStyle = `hsl(${hue}, 100%, 68%)`;
        ctx.fillText(chars[idx], x, y);
        // Inner highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = `hsl(${(hue + 30) % 360}, 100%, 88%)`;
        ctx.fillText(chars[idx], x, y - 2 * dpr);
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
  }, [artist, title]);

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[9999] bg-background overflow-hidden"
    >
      <Visualizer analyser={analyser} style={style === "off" ? "tunnel" : style} />
      <BeatOverlay analyser={analyser} enabled />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute left-0 right-0 pointer-events-none"
        style={{ top: "50%", transform: "translateY(-50%)", zIndex: 5 }}
      />
      <div
        className="absolute top-4 left-0 right-0 text-center pointer-events-none"
        style={{ zIndex: 6 }}
      >
        <p className="text-xs uppercase tracking-[0.4em] text-primary/80 neon">
          A Qumran Cracktro · Nectarine Demoscene Radio
        </p>
      </div>
      <button
        type="button"
        onClick={onExit}
        className="absolute top-4 right-4 z-10 min-h-11 px-3 py-2 text-xs uppercase tracking-widest rounded-sm border border-border bg-card/80 text-foreground hover:bg-card hover:opacity-90 touch-manipulation"
        style={{ zIndex: 10 }}
        aria-label="Exit fullscreen cracktro"
      >
        Exit ✕
      </button>
      <p
        className="absolute bottom-4 left-0 right-0 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground pointer-events-none"
        style={{ zIndex: 6 }}
      >
        Press ESC to exit
      </p>
    </div>
  );
};

export default Cracktro;
