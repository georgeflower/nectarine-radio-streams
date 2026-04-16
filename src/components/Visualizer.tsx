import { useEffect, useRef } from "react";

export type VisualizerStyle = "off" | "starfield" | "bars" | "plasma" | "oscilloscope";

type Props = {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
};

type Star = { x: number; y: number; z: number };

type AudioSnapshot = {
  bass: number;
  mid: number;
  treble: number;
  rms: number;
  freq: Uint8Array | null;
  time: Uint8Array | null;
};

const STAR_COUNT = 400;
const MAX_DEPTH = 1000;

const Visualizer = ({ analyser, style }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number | null>(null);
  const plasmaTRef = useRef(0);
  const idleTRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let freq: Uint8Array<ArrayBuffer> | null = analyser
      ? (new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as Uint8Array<ArrayBuffer>)
      : null;
    let time: Uint8Array<ArrayBuffer> | null = analyser
      ? (new Uint8Array(new ArrayBuffer(analyser.fftSize)) as Uint8Array<ArrayBuffer>)
      : null;

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    const sampleAudio = (): AudioSnapshot => {
      let bass = 0;
      let mid = 0;
      let treble = 0;
      let rms = 0;

      if (analyser && freq && time) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);

        const n = freq.length;
        const bEnd = Math.max(1, Math.floor(n * 0.08));
        const mEnd = Math.max(bEnd + 1, Math.floor(n * 0.38));

        let sumBass = 0;
        for (let i = 0; i < bEnd; i++) sumBass += freq[i] ?? 0;
        bass = sumBass / bEnd / 255;

        let sumMid = 0;
        for (let i = bEnd; i < mEnd; i++) sumMid += freq[i] ?? 0;
        mid = sumMid / Math.max(1, mEnd - bEnd) / 255;

        let sumTreble = 0;
        for (let i = mEnd; i < n; i++) sumTreble += freq[i] ?? 0;
        treble = sumTreble / Math.max(1, n - mEnd) / 255;

        let sq = 0;
        for (let i = 0; i < time.length; i++) {
          const centered = (time[i] - 128) / 128;
          sq += centered * centered;
        }
        rms = Math.sqrt(sq / time.length);
      }

      return { bass, mid, treble, rms, freq, time };
    };

    resize();
    window.addEventListener("resize", resize);

    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * MAX_DEPTH,
    }));

    const renderStarfield = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const { bass, mid, treble } = sampleAudio();
      const fade = 0.15 + treble * 0.5;
      ctx.fillStyle = `hsla(20, 25%, 6%, ${fade})`;
      ctx.fillRect(0, 0, w, h);
      const speed = (1 + bass * 6) * dpr * 1.2;
      const hue = 28 + mid * 80;
      const light = 55 + treble * 20;

      for (const s of starsRef.current) {
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
      const w = canvas.width;
      const h = canvas.height;
      const { bass, mid, treble, rms, freq } = sampleAudio();
      idleTRef.current += 0.03 + bass * 0.05;

      ctx.fillStyle = "hsla(20, 25%, 6%, 0.2)";
      ctx.fillRect(0, 0, w, h);

      const bins = 56;
      const barW = w / bins;
      const usable = freq?.length ?? 0;
      const step = Math.max(1, Math.floor(usable / bins));
      const energy = Math.max(rms * 4, bass * 1.2, mid, treble * 0.8);
      const baseline = h - 16 * dpr;

      ctx.shadowBlur = 18 * dpr;
      ctx.shadowColor = "hsl(28 100% 60%)";

      for (let i = 0; i < bins; i++) {
        let raw = 0;
        if (freq) {
          for (let j = 0; j < step; j++) raw += freq[Math.min(usable - 1, i * step + j)] ?? 0;
          raw = raw / step / 255;
        }

        const idlePulse = 0.08 + 0.08 * Math.sin(i * 0.45 + idleTRef.current);
        const v = Math.max(raw, energy > 0.01 ? 0 : idlePulse);
        const shaped = Math.pow(Math.max(0, v), 0.65);
        const barH = Math.max(4 * dpr, shaped * h * 0.62);
        const hue = 24 + (i / bins) * 70 + treble * 20;
        const grad = ctx.createLinearGradient(0, baseline, 0, baseline - barH);
        grad.addColorStop(0, `hsla(${hue}, 100%, 48%, 0.98)`);
        grad.addColorStop(0.6, `hsla(${(hue + 18) % 360}, 100%, 62%, 0.95)`);
        grad.addColorStop(1, `hsla(${(hue + 38) % 360}, 100%, 78%, 0.9)`);
        ctx.fillStyle = grad;
        ctx.fillRect(i * barW + 1.5 * dpr, baseline - barH, Math.max(2 * dpr, barW - 3 * dpr), barH);
      }

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `hsla(${28 + treble * 50}, 100%, 70%, 0.55)`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, baseline + 1);
      ctx.lineTo(w, baseline + 1);
      ctx.stroke();
    };

    const renderPlasma = () => {
      const w = canvas.width;
      const h = canvas.height;
      const { bass, mid, treble } = sampleAudio();
      plasmaTRef.current += 0.005 + bass * 0.025;
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
          const hue = (v * 40 + t * 6 + treble * 60) % 360;
          ctx.fillStyle = `hsl(${(hue + 360) % 360}, 90%, ${40 + energy * 20}%)`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
    };

    const renderOscilloscope = () => {
      const w = canvas.width;
      const h = canvas.height;
      const { bass, treble, rms, time } = sampleAudio();
      idleTRef.current += 0.04;

      ctx.fillStyle = "hsla(20, 25%, 6%, 0.22)";
      ctx.fillRect(0, 0, w, h);

      const centerY = h * 0.5;
      ctx.strokeStyle = `hsla(${28 + treble * 60}, 100%, ${62 + bass * 16}%, 0.95)`;
      ctx.lineWidth = (2 + bass * 2) * dpr;
      ctx.shadowBlur = 14 * dpr;
      ctx.shadowColor = "hsl(28 100% 60%)";
      ctx.beginPath();

      if (time && time.length > 1) {
        for (let i = 0; i < time.length; i++) {
          const x = (i / (time.length - 1)) * w;
          const centered = (time[i] - 128) / 128;
          const y = centerY + centered * h * (0.18 + rms * 1.8);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        for (let i = 0; i <= 160; i++) {
          const x = (i / 160) * w;
          const y = centerY + Math.sin(i * 0.2 + idleTRef.current) * h * 0.04;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "hsla(28, 100%, 75%, 0.22)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();
    };

    const render = () => {
      if (style === "bars") renderBars();
      else if (style === "plasma") renderPlasma();
      else if (style === "oscilloscope") renderOscilloscope();
      else if (style === "starfield") renderStarfield();
      rafRef.current = requestAnimationFrame(render);
    };

    if (style === "off") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      rafRef.current = requestAnimationFrame(render);
    }

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
