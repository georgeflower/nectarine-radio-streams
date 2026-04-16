import { useEffect, useRef } from "react";

export type VisualizerStyle = "starfield" | "bars" | "plasma";

type Props = {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
};

type Star = { x: number; y: number; z: number };

const STAR_COUNT = 400;
const MAX_DEPTH = 1000;

const Visualizer = ({ analyser, style }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number | null>(null);
  const plasmaTRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * MAX_DEPTH,
    }));

    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const computeBands = () => {
      let bass = 0, mid = 0, treble = 0;
      if (analyser && freq) {
        analyser.getByteFrequencyData(freq);
        const n = freq.length;
        const bEnd = Math.max(1, Math.floor(n * 0.06));
        const mEnd = Math.max(bEnd + 1, Math.floor(n * 0.4));
        let bs = 0;
        for (let i = 0; i < bEnd; i++) bs += freq[i];
        bass = bs / bEnd / 255;
        let ms = 0;
        for (let i = bEnd; i < mEnd; i++) ms += freq[i];
        mid = ms / (mEnd - bEnd) / 255;
        let ts = 0;
        for (let i = mEnd; i < n; i++) ts += freq[i];
        treble = ts / (n - mEnd) / 255;
      }
      return { bass, mid, treble };
    };

    const renderStarfield = () => {
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const { bass, mid, treble } = computeBands();
      const fade = 0.15 + treble * 0.5;
      ctx.fillStyle = `hsla(20, 25%, 6%, ${fade})`;
      ctx.fillRect(0, 0, w, h);
      const speed = (1 + bass * 6) * dpr * 1.2;
      const hue = 28 + mid * 80;
      const light = 55 + treble * 20;
      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.z -= speed * 2;
        if (s.z <= 1) {
          s.x = (Math.random() - 0.5) * 2000;
          s.y = (Math.random() - 0.5) * 2000;
          s.z = MAX_DEPTH;
        }
        const k = 200 / s.z;
        const px = cx + s.x * k * dpr;
        const py = cy + s.y * k * dpr;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        const size = (1 - s.z / MAX_DEPTH) * 3 * dpr + 0.5;
        const alpha = Math.min(1, (1 - s.z / MAX_DEPTH) * (0.5 + bass * 0.8));
        ctx.fillStyle = `hsla(${hue}, 100%, ${light}%, ${alpha})`;
        ctx.fillRect(px, py, size, size);
      }
    };

    const renderBars = () => {
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = "hsla(20, 25%, 6%, 0.4)";
      ctx.fillRect(0, 0, w, h);
      if (!analyser || !freq) {
        return;
      }
      analyser.getByteFrequencyData(freq);
      const bins = 64;
      const step = Math.max(1, Math.floor(freq.length / bins));
      const barW = w / bins;
      for (let i = 0; i < bins; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += freq[i * step + j] ?? 0;
        const v = sum / step / 255;
        const barH = Math.max(2 * dpr, v * h * 0.85);
        const hue = 28 + (i / bins) * 80;
        const grad = ctx.createLinearGradient(0, h, 0, h - barH);
        grad.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.95)`);
        grad.addColorStop(1, `hsla(${(hue + 40) % 360}, 100%, 70%, 0.95)`);
        ctx.fillStyle = grad;
        ctx.fillRect(i * barW + 1, h - barH, Math.max(1, barW - 2), barH);
      }
    };

    const renderPlasma = () => {
      const w = canvas.width, h = canvas.height;
      const { bass, mid, treble } = computeBands();
      plasmaTRef.current += 0.02 + bass * 0.08;
      const t = plasmaTRef.current;
      const cell = Math.max(8, Math.floor(12 * dpr));
      const energy = 0.4 + bass * 0.6 + mid * 0.3;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const nx = x / w - 0.5;
          const ny = y / h - 0.5;
          const v =
            Math.sin(nx * 8 + t) +
            Math.sin(ny * 8 + t * 1.3) +
            Math.sin((nx + ny) * 6 + t * 0.7) +
            Math.sin(Math.sqrt(nx * nx + ny * ny) * 12 - t);
          const hue = (v * 40 + t * 20 + treble * 60) % 360;
          ctx.fillStyle = `hsl(${(hue + 360) % 360}, 90%, ${40 + energy * 20}%)`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
    };

    const render = () => {
      if (style === "bars") renderBars();
      else if (style === "plasma") renderPlasma();
      else renderStarfield();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, style]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default Visualizer;
