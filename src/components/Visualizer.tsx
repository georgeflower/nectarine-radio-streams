import { useEffect, useRef } from "react";

type Props = {
  analyser: AnalyserNode | null;
};

type Star = { x: number; y: number; z: number };

const STAR_COUNT = 400;
const MAX_DEPTH = 1000;

const Visualizer = ({ analyser }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number | null>(null);

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

    // init stars
    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * MAX_DEPTH,
    }));

    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      let bass = 0;
      let mid = 0;
      let treble = 0;
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

      // trail/fade — more treble = shorter trail (lower alpha clear)
      const fade = 0.15 + treble * 0.5;
      ctx.fillStyle = `hsla(20, 25%, 6%, ${fade})`;
      ctx.fillRect(0, 0, w, h);

      const speed = (1 + bass * 6) * dpr * 1.2;
      const hue = 28 + mid * 80; // amber -> pink shift
      const sat = 100;
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
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
        ctx.fillRect(px, py, size, size);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser]);

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
