import { useEffect, useRef, useState } from "react";

export type VisualizerStyle =
  | "off"
  | "starfield"
  | "bars"
  | "plasma"
  | "oscilloscope"
  | "tunnel"
  | "rings"
  | "particles";

type Props = {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
};

type Star = { x: number; y: number; z: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; hue: number };

type AudioSnapshot = {
  bass: number;
  mid: number;
  treble: number;
  rms: number;
  beat: boolean;
  freq: Uint8Array | null;
  time: Uint8Array | null;
};

const STAR_COUNT = 400;
const MAX_DEPTH = 1000;
const PARTICLE_COUNT = 220;
// Keep a small reuse window so multiple rAF-driven hooks in the same visual frame
// can share analyser data without adding noticeable latency.
const FRAME_CACHE_WINDOW_MS = 4;
type FreqFrame = { ts: number; buf: Uint8Array; bass: number; bEnd: number };
const freqFrameCache = new WeakMap<AnalyserNode, FreqFrame>();

const getFreqFrame = (analyser: AnalyserNode): FreqFrame => {
  const now = performance.now();
  const cached = freqFrameCache.get(analyser);
  if (
    cached &&
    cached.buf.length === analyser.frequencyBinCount &&
    now - cached.ts < FRAME_CACHE_WINDOW_MS
  ) {
    return cached;
  }

  const bufferSizeChanged = !cached || cached.buf.length !== analyser.frequencyBinCount;
  const buf: Uint8Array<ArrayBuffer> =
    bufferSizeChanged
      ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      : (cached.buf as Uint8Array<ArrayBuffer>);
  analyser.getByteFrequencyData(buf);

  const bEnd =
    cached && !bufferSizeChanged
      ? cached.bEnd
      : Math.max(1, Math.floor(buf.length * 0.08));
  let sum = 0;
  for (let i = 0; i < bEnd; i++) sum += buf[i];
  const frame: FreqFrame = { ts: now, buf, bass: sum / bEnd / 255, bEnd };
  freqFrameCache.set(analyser, frame);
  return frame;
};

const Visualizer = ({ analyser, style }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const plasmaTRef = useRef(0);
  const idleTRef = useRef(0);
  const tunnelTRef = useRef(0);
  const ringsTRef = useRef(0);
  const bassAvgRef = useRef(0);
  const beatCooldownRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isFirefox =
      typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent);
    // Firefox's Canvas2D backend renders shadowBlur on the CPU and the blur
    // kernel scales with pixel count, so cap dpr more aggressively there.
    const dpr = Math.min(window.devicePixelRatio || 1, isFirefox ? 1.5 : 2);
    // shadowBlur is a major bottleneck in Firefox: every stroke/fill that
    // happens while shadowBlur > 0 hits a slow software path. Disable it
    // entirely on Firefox; individual scenes substitute a cheaper neon look.
    const glow = (px: number) => (isFirefox ? 0 : px);
    const freq: Uint8Array<ArrayBuffer> | null = analyser
      ? (new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as Uint8Array<ArrayBuffer>)
      : null;
    const time: Uint8Array<ArrayBuffer> | null = analyser
      ? (new Uint8Array(new ArrayBuffer(analyser.fftSize)) as Uint8Array<ArrayBuffer>)
      : null;

    const stageEl = canvas.parentElement;
    const stageW = () => (stageEl ? stageEl.clientWidth : window.innerWidth);
    const stageH = () => (stageEl ? stageEl.clientHeight : window.innerHeight);
    const resize = () => {
      const w = stageW();
      const h = stageH();
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    const sampleAudio = (): AudioSnapshot => {
      let bass = 0;
      let mid = 0;
      let treble = 0;
      let rms = 0;
      let beat = false;

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

        // beat detection on bass band
        const avg = bassAvgRef.current;
        bassAvgRef.current = avg * 0.92 + bass * 0.08;
        if (beatCooldownRef.current > 0) beatCooldownRef.current -= 1;
        if (bass > avg * 1.35 && bass > 0.15 && beatCooldownRef.current <= 0) {
          beat = true;
          beatCooldownRef.current = 10;
        }
      }

      return { bass, mid, treble, rms, beat, freq, time };
    };

    resize();
    let ro: ResizeObserver | null = null;
    if (stageEl) {
      ro = new ResizeObserver(resize);
      ro.observe(stageEl);
    } else {
      window.addEventListener("resize", resize);
    }

    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * MAX_DEPTH,
    }));

    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      life: Math.random(),
      hue: 28 + Math.random() * 40,
    }));

    const renderStarfield = (dt: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = "hsla(20, 25%, 6%, 0.2)";
      ctx.fillRect(0, 0, w, h);
      const baseSpeed = 1.4 * dpr; // units per frame at 60fps
      const speed = baseSpeed * (dt / (1000 / 60)); // scale by actual frame time
      const hue = 28;
      const light = 60;

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
        const alpha = Math.min(1, (1 - s.z / MAX_DEPTH) * 0.7);
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

      ctx.shadowBlur = glow(18 * dpr);
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
      ctx.shadowBlur = glow(14 * dpr);
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

    const renderTunnel = () => {
      const w = canvas.width;
      const h = canvas.height;
      const { bass, mid, treble, rms } = sampleAudio();
      // Forward speed boosted by bass; minimum idle motion.
      tunnelTRef.current += 0.04 + bass * 0.18 + rms * 0.08;
      const t = tunnelTRef.current;

      // Motion-blur background trail.
      ctx.fillStyle = "hsla(20, 25%, 6%, 0.32)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const slices = isFirefox ? 24 : 36;
      const baseR = Math.min(w, h) * 0.55;
      // Tunnel curvature amplitude reacts to mid.
      const curve = (60 + mid * 220) * dpr;
      // Twist per unit z, reacts to treble.
      const twist = 0.18 + treble * 0.5;

      // Walk slices from far (z=slices) to near (z=0). Use phase offset so
      // slices feel like they're flying toward camera continuously.
      type Slice = { x: number; y: number; r: number; roll: number; hue: number; depth: number };
      const sl: Slice[] = [];
      for (let i = slices; i >= 1; i--) {
        const phase = (i - (t % 1));
        const z = phase + 0.4; // avoid div by 0
        const depth = z / slices; // 0..1 (near..far)
        const px = Math.sin(z * 0.35 + t * 0.6) * curve;
        const py = Math.cos(z * 0.28 + t * 0.4) * curve * 0.8;
        const persp = 1 / z;
        const r = baseR * persp * (1 + bass * 0.25);
        const roll = z * twist + t * 0.7;
        const hue = (28 + z * 18 + t * 30 + treble * 60) % 360;
        sl.push({ x: cx + px, y: cy + py, r, roll, hue, depth });
      }

      const sides = isFirefox ? 10 : 14;
      const ringCutoff = isFirefox ? 0.15 : 0.05;
      const segCutoff = isFirefox ? 0.08 : 0.02;
      ctx.lineCap = "round";

      // --- Connecting wireframe between consecutive slices ---
      // Batch by hue bucket (30° on FF) so we issue a handful of strokes
      // instead of one per slice. Big win since each stroke() flushes state.
      const hueBucket = isFirefox ? 30 : 360; // 360 == no bucketing
      type Bucket = { hue: number; fadeSum: number; count: number; segs: Array<[number, number, number, number]> };
      const buckets = new Map<number, Bucket>();
      for (let i = 0; i < sl.length - 1; i++) {
        const a = sl[i];
        const b = sl[i + 1];
        const fade = 1 - a.depth;
        if (fade <= segCutoff) continue;
        const key = hueBucket >= 360 ? i : Math.round(a.hue / hueBucket);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { hue: a.hue, fadeSum: 0, count: 0, segs: [] };
          buckets.set(key, bucket);
        }
        bucket.hue = a.hue;
        bucket.fadeSum += fade;
        bucket.count += 1;
        for (let k = 0; k < sides; k++) {
          const angA = (k / sides) * Math.PI * 2 + a.roll;
          const angB = (k / sides) * Math.PI * 2 + b.roll;
          bucket.segs.push([
            a.x + Math.cos(angA) * a.r,
            a.y + Math.sin(angA) * a.r,
            b.x + Math.cos(angB) * b.r,
            b.y + Math.sin(angB) * b.r,
          ]);
        }
      }
      for (const bucket of buckets.values()) {
        const fade = bucket.fadeSum / Math.max(1, bucket.count);
        ctx.strokeStyle = `hsla(${bucket.hue}, 100%, ${48 + bass * 22}%, ${fade * 0.85})`;
        ctx.lineWidth = Math.max(0.5, (1.2 + bass * 1.8) * dpr * fade);
        ctx.shadowBlur = glow(14 * dpr * fade);
        ctx.shadowColor = `hsl(${bucket.hue}, 100%, 60%)`;
        ctx.beginPath();
        for (const [ax, ay, bx, by] of bucket.segs) {
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
        // On Firefox we have no shadow glow; fake it with a wider, low-alpha
        // pass underneath. Cheaper than shadowBlur because it's still a flat
        // stroke, no per-pixel blur kernel.
        if (isFirefox) {
          ctx.strokeStyle = `hsla(${bucket.hue}, 100%, 60%, ${fade * 0.25})`;
          ctx.lineWidth = Math.max(1, (3 + bass * 2) * dpr * fade);
          ctx.stroke();
        }
      }

      // --- Ring outlines on each slice (subtle, foreground only) ---
      for (const s of sl) {
        const fade = Math.pow(1 - s.depth, 1.4);
        if (fade <= ringCutoff) continue;
        ctx.shadowBlur = glow(12 * dpr * fade);
        ctx.shadowColor = `hsl(${s.hue}, 100%, 60%)`;
        ctx.strokeStyle = `hsla(${s.hue}, 100%, ${60 + bass * 20}%, ${fade * 0.7})`;
        ctx.lineWidth = Math.max(0.5, (1 + bass * 2) * dpr * fade);
        ctx.beginPath();
        for (let k = 0; k <= sides; k++) {
          const ang = (k / sides) * Math.PI * 2 + s.roll;
          const x = s.x + Math.cos(ang) * s.r;
          const y = s.y + Math.sin(ang) * s.r;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (isFirefox) {
          ctx.strokeStyle = `hsla(${s.hue}, 100%, 70%, ${fade * 0.22})`;
          ctx.lineWidth = Math.max(1, (3 + bass * 2.4) * dpr * fade);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    };

    const renderRings = () => {
      const w = canvas.width;
      const h = canvas.height;
      const { bass, mid, treble, rms, freq } = sampleAudio();
      ringsTRef.current += 0.004 + rms * 0.08;
      const t = ringsTRef.current;

      ctx.fillStyle = "hsla(20, 25%, 6%, 0.25)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.18 + bass * Math.min(w, h) * 0.08;
      const bins = 96;
      const usable = freq?.length ?? 0;
      const step = Math.max(1, Math.floor(usable / bins));

      ctx.shadowBlur = glow(14 * dpr);
      ctx.lineCap = "round";

      for (let i = 0; i < bins; i++) {
        let v = 0;
        if (freq) {
          for (let j = 0; j < step; j++) v += freq[Math.min(usable - 1, i * step + j)] ?? 0;
          v = v / step / 255;
        } else {
          v = 0.15 + 0.1 * Math.sin(i * 0.4 + t * 4);
        }
        const angle = (i / bins) * Math.PI * 2 + t;
        const len = (10 + v * Math.min(w, h) * 0.32) * 1;
        const hue = (28 + (i / bins) * 120 + treble * 60) % 360;
        ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
        ctx.strokeStyle = `hsla(${hue}, 100%, ${55 + mid * 25}%, 0.95)`;
        ctx.lineWidth = (2 + bass * 2) * dpr;
        const x1 = cx + Math.cos(angle) * baseR;
        const y1 = cy + Math.sin(angle) * baseR;
        const x2 = cx + Math.cos(angle) * (baseR + len);
        const y2 = cy + Math.sin(angle) * (baseR + len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `hsla(28, 100%, 70%, ${0.3 + bass * 0.5})`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.stroke();
    };

    const renderParticles = () => {
      const w = canvas.width;
      const h = canvas.height;
      const { bass, mid, treble, beat } = sampleAudio();

      ctx.fillStyle = "hsla(20, 25%, 6%, 0.18)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const ps = particlesRef.current;

      for (const p of ps) {
        if (beat) {
          const a = Math.random() * Math.PI * 2;
          const kick = (3 + bass * 12) * dpr;
          p.vx += Math.cos(a) * kick * 0.3;
          p.vy += Math.sin(a) * kick * 0.3;
          p.life = 1;
          p.hue = 28 + Math.random() * 80 + treble * 60;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life *= 0.985;

        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > Math.max(w, h) || p.life < 0.05) {
          p.x = cx + (Math.random() - 0.5) * 20 * dpr;
          p.y = cy + (Math.random() - 0.5) * 20 * dpr;
          const a = Math.random() * Math.PI * 2;
          const s = (0.5 + Math.random() * 1.5) * dpr;
          p.vx = Math.cos(a) * s;
          p.vy = Math.sin(a) * s;
          p.life = 0.4 + Math.random() * 0.4;
          p.hue = 28 + Math.random() * 60;
        }

        const size = (1.4 + mid * 3) * dpr * (0.4 + p.life);
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${60 + bass * 20}%, ${p.life})`;
        ctx.shadowBlur = glow(10 * dpr * p.life);
        ctx.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    const render = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const dt = Math.min(now - lastTimeRef.current, 50); // cap at 50ms to avoid huge jumps
      lastTimeRef.current = now;

      switch (style) {
        case "bars": renderBars(); break;
        case "plasma": renderPlasma(); break;
        case "oscilloscope": renderOscilloscope(); break;
        case "starfield": renderStarfield(dt); break;
        case "tunnel": renderTunnel(); break;
        case "rings": renderRings(); break;
        case "particles": renderParticles(); break;
      }
      rafRef.current = requestAnimationFrame(render);
    };

    if (style === "off") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(render);
    }

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, style]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default Visualizer;

/**
 * Lightweight hook that returns a 0..1 bass level derived from an analyser node.
 * Updates via rAF; returns 0 when analyser is null.
 */
export const useAudioLevel = (analyser: AnalyserNode | null, enabled = true): number => {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);
  const smoothRef = useRef(0);

  useEffect(() => {
    if (!analyser || !enabled) {
      setLevel(0);
      return;
    }

    const tick = () => {
      const { bass } = getFreqFrame(analyser);
      smoothRef.current = smoothRef.current * 0.7 + bass * 0.3;
      setLevel(smoothRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, enabled]);

  return level;
};

/**
 * Returns a number that bumps to 1 on each detected kick and decays back to 0.
 * Use for flash/scale overlays. Returns 0 when analyser is null or disabled.
 */
export const useBeat = (analyser: AnalyserNode | null, enabled = true): number => {
  const [pulse, setPulse] = useState(0);
  const rafRef = useRef<number | null>(null);
  const avgRef = useRef(0);
  const cooldownRef = useRef(0);
  const pulseRef = useRef(0);

  useEffect(() => {
    if (!analyser || !enabled) {
      setPulse(0);
      return;
    }

    const tick = () => {
      const { bass } = getFreqFrame(analyser);
      const avg = avgRef.current;
      avgRef.current = avg * 0.92 + bass * 0.08;
      if (cooldownRef.current > 0) cooldownRef.current -= 1;
      if (bass > avg * 1.35 && bass > 0.15 && cooldownRef.current <= 0) {
        pulseRef.current = Math.min(1, 0.6 + bass);
        cooldownRef.current = 10;
      }
      pulseRef.current *= 0.86;
      if (pulseRef.current < 0.01) pulseRef.current = 0;
      setPulse(pulseRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, enabled]);

  return pulse;
};

/**
 * Returns { bpm, beatIndex, beat } based on detected bass kicks.
 *  - bpm: rolling-median tempo across recent beat intervals (0 until enough beats).
 *  - beatIndex: 0..3 (which sixteenth-of-a-bar this beat lands on, mod 4).
 *  - beat: increments each detected beat (use to drive grid animations).
 */
export type BpmStatus = "no-audio" | "silent" | "listening" | "detecting" | "locked";

export type BpmDebug = {
  bpm: number;
  beatIndex: number;
  beatCount: number;
  status: BpmStatus;
  beatTimes: number[]; // recent metronome ticks (ms, performance.now)
  windowMs: number;
  lastComputeAt: number;
  lastBass: number;
  period: number; // current metronome period in ms
  phaseErrorMs: number; // signed error of the last onset vs nearest expected beat
  confidence: number; // 0..1 tracker lock confidence
};

// Real-time beat tracker, ported from librosa.beat.beat_track:
//
//   1. Log-mel onset strength envelope (a la librosa.onset.onset_strength):
//      40 mel bands 0-8 kHz, log1p compression, half-wave-rectified
//      frame-to-frame flux, summed across bands.
//   2. Tempo estimate (a la librosa.beat.tempo): autocorrelation of the
//      onset envelope over a rolling ~8 s window, multiplied by a
//      log-Gaussian prior centered at 125 BPM, peak picked in 60-200 BPM.
//   3. Dynamic-programming beat tracker (Ellis 2007 / librosa default):
//      score[i] = onset[i] + max_j ( score[j] - tightness * log(dt/P)^2 ),
//      backtracked to a globally consistent beat sequence over the window.
//   4. The DP grid drives a free-running metronome (period + nextBeatAt)
//      that keeps ticking at 60 Hz between recomputes. Phase nudges when
//      the new grid agrees, snaps when it strongly disagrees with high
//      confidence. Recompute cadence stretches from 1 s -> 2 s once locked.
//
// Starts at 125 BPM (period = 480 ms), the demoscene/dance default.

export const useBpm = (
  analyser: AnalyserNode | null,
  enabled = true,
  trackKey?: string | number,
): BpmDebug => {
  const WINDOW_MS = 10000;
  const INITIAL_BPM = 125;
  const INITIAL_PERIOD = 60000 / INITIAL_BPM;
  const MIN_PERIOD = 60000 / 200;
  const MAX_PERIOD = 60000 / 60;
  const TIGHTNESS = 100;
  const HOP_MS = 12; // fixed analysis hop (~83 Hz) for stable tempo resolution

  const [state, setState] = useState<BpmDebug>({
    bpm: INITIAL_BPM,
    beatIndex: 0,
    beatCount: 0,
    status: "no-audio",
    beatTimes: [],
    windowMs: WINDOW_MS,
    lastComputeAt: 0,
    lastBass: 0,
    period: INITIAL_PERIOD,
    phaseErrorMs: 0,
    confidence: 0,
  });

  const rafRef = useRef<number | null>(null);
  const recomputeTimerRef = useRef<number | null>(null);

  const periodRef = useRef(INITIAL_PERIOD);
  const nextBeatAtRef = useRef(0);
  const confidenceRef = useRef(0);
  const phaseErrorRef = useRef(0);
  const beatIdxRef = useRef(0);
  const beatCountRef = useRef(0);
  const metronomeBeatsRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const lastPeriodRef = useRef(0);
  const lastBassRef = useRef(0);
  const lastFluxRef = useRef(0);
  const displayPeriodRef = useRef(INITIAL_PERIOD);

  useEffect(() => {
    setState({
      bpm: INITIAL_BPM,
      beatIndex: 0,
      beatCount: 0,
      status: analyser && enabled ? "listening" : "no-audio",
      beatTimes: [],
      windowMs: WINDOW_MS,
      lastComputeAt: 0,
      lastBass: 0,
      period: INITIAL_PERIOD,
      phaseErrorMs: 0,
      confidence: 0,
    });

    if (!analyser || !enabled) return;

    const previousSmoothing = analyser.smoothingTimeConstant;
    // Onset detection wants raw frames — kill the analyser's IIR smoothing.
    analyser.smoothingTimeConstant = 0;

    const NBINS = analyser.frequencyBinCount;
    const SR = analyser.context.sampleRate;
    const floatBuf = new Float32Array(NBINS);
    const magBuf = new Float32Array(NBINS);
    const bassEnd = Math.max(1, Math.floor(NBINS * 0.1));

    // Per-band rolling state.
    const NBANDS = BANDS.length;
    const TOTAL_FEATURES = NBANDS + 1;
    const prevBands = new Float32Array(NBANDS);
    const fluxBands = new Float32Array(NBANDS);
    const prevSpectralShape = new Float32Array(NBINS);

    // Ring buffers per band — onset envelope at HOP_MS.
    const FRAMES = Math.ceil((WINDOW_MS * 1.2) / HOP_MS);
    const envT = new Float64Array(FRAMES);
    const envBands: Float32Array[] = Array.from(
      { length: TOTAL_FEATURES },
      () => new Float32Array(FRAMES),
    );
    let envIdx = 0;
    let envFilled = 0;

    const now0 = performance.now();
    startedAtRef.current = now0;
    nextBeatAtRef.current = 0;
    let running = false;
    let silentSince = 0;
    let lastHopAt = 0;
    const SILENT_BASS = 0.01;
    const SILENT_FLUX = 0.0005;
    const SILENT_TIMEOUT = 2500;

    const clampPeriod = (p: number) => Math.min(MAX_PERIOD, Math.max(MIN_PERIOD, p));

    // ---- rAF loop: build onset envelope + tick metronome ----
    const tick = () => {
      analyser.getFloatFrequencyData(floatBuf);
      const now = performance.now();

      // dB → linear magnitude, and crude bass level for silence detection.
      let bassSum = 0;
      for (let i = 0; i < NBINS; i++) {
        const db = floatBuf[i];
        // -100 dB floor → 0 magnitude.
        const lin = db > -100 ? Math.pow(10, db / 20) : 0;
        magBuf[i] = lin;
        if (i < bassEnd) bassSum += lin;
      }
      lastBassRef.current = Math.min(1, bassSum / bassEnd * 4);

      // Only accumulate a new onset frame every HOP_MS to keep the envelope
      // at a fixed sample rate independent of display refresh.
      if (now - lastHopAt >= HOP_MS) {
        lastHopAt = now;
        bandFlux(magBuf, SR, prevBands, fluxBands);
        let totalFlux = 0;
        for (let b = 0; b < NBANDS; b++) totalFlux += fluxBands[b];
        const shapeNovelty = spectralNovelty(magBuf, prevSpectralShape);
        // Flux and spectral novelty are both sparse/whitened later; average them
        // here only for coarse "audible rhythm present" gating.
        lastFluxRef.current = (totalFlux + shapeNovelty) / TOTAL_FEATURES;

        envT[envIdx] = now;
        for (let b = 0; b < NBANDS; b++) envBands[b][envIdx] = fluxBands[b];
        envBands[NBANDS][envIdx] = shapeNovelty;
        envIdx = (envIdx + 1) % FRAMES;
        if (envFilled < FRAMES) envFilled++;
      }

      // silence handling → pause metronome and decay
      const audible = lastBassRef.current > SILENT_BASS || lastFluxRef.current > SILENT_FLUX;
      if (audible) {
        silentSince = 0;
      } else if (silentSince === 0) {
        silentSince = now;
      } else if (running && now - silentSince > SILENT_TIMEOUT) {
        running = false;
        nextBeatAtRef.current = 0;
        confidenceRef.current = Math.max(0, confidenceRef.current - 0.2);
      }

      // metronome ticks
      if (running && nextBeatAtRef.current > 0) {
        while (now >= nextBeatAtRef.current) {
          const fired = nextBeatAtRef.current;
          metronomeBeatsRef.current.push(fired);
          const cutoff = fired - WINDOW_MS;
          while (metronomeBeatsRef.current.length && metronomeBeatsRef.current[0] < cutoff) {
            metronomeBeatsRef.current.shift();
          }
          beatCountRef.current += 1;
          beatIdxRef.current = (beatIdxRef.current + 1) % 4;
          nextBeatAtRef.current = fired + periodRef.current;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    // Copy per-band ring buffers to linear oldest→newest arrays.
    const linearize = (): { t: Float64Array; bands: Float32Array[] } | null => {
      if (envFilled < 80) return null;
      const len = envFilled;
      const t = new Float64Array(len);
      const bands: Float32Array[] = envBands.map(() => new Float32Array(len));
      const start = envFilled < FRAMES ? 0 : envIdx;
      for (let i = 0; i < len; i++) {
        const j = (start + i) % FRAMES;
        t[i] = envT[j];
        for (let b = 0; b < TOTAL_FEATURES; b++) bands[b][i] = envBands[b][j];
      }
      return { t, bands };
    };

    // ---- recompute: fused tempogram + DP + PLP phase ----
    let recomputing = false;
    const recompute = () => {
      const now = performance.now();
      const lastBass = lastBassRef.current;
      const elapsed = now - startedAtRef.current;
      let conf = confidenceRef.current;

      const audible =
        lastBassRef.current > SILENT_BASS || lastFluxRef.current > SILENT_FLUX;

      if (audible && !recomputing) {
        recomputing = true;
        const linear = linearize();
        if (linear) {
          const { t, bands } = linear;
          // Effective frame period across the window.
          const frameMs = (t[t.length - 1] - t[0]) / Math.max(1, t.length - 1);
          if (Number.isFinite(frameMs) && frameMs > 4 && frameMs < 80) {
            // Whiten each band, then fuse.
            for (let b = 0; b < TOTAL_FEATURES; b++) whitenInPlace(bands[b]);
            const weights = new Float32Array(TOTAL_FEATURES);
            for (let b = 0; b < TOTAL_FEATURES; b++) {
              const tBand = pickTempo(bands[b], frameMs);
              // Keep a floor so no feature stream disappears entirely; let
              // stronger periodic prominence increase influence.
              weights[b] = 0.3 + Math.max(0, Math.min(1, tBand?.prominence ?? 0));
            }
            const { fused, maxBand } = fuseBandEnvelopes(bands, weights);

            // Try fused first; if it's anemic, fall back to the strongest band.
            let tempo = pickTempo(fused, frameMs);
            let envForBeats = fused;
            if (!tempo || tempo.prominence < 0.5) {
              const altTempo = pickTempo(maxBand, frameMs);
              if (altTempo && (!tempo || altTempo.prominence > tempo.prominence)) {
                tempo = altTempo;
                envForBeats = maxBand;
              }
            }

            if (tempo) {
              const candidatePeriod = clampPeriod(tempo.bpm > 0 ? 60000 / tempo.bpm : MIN_PERIOD);
              const periodFrames = candidatePeriod / frameMs;
              const beats = dpBeats(envForBeats, periodFrames, TIGHTNESS);

              if (beats.length >= 2) {
                const ibis: number[] = [];
                for (let i = 1; i < beats.length; i++) {
                  ibis.push(t[beats[i]] - t[beats[i - 1]]);
                }
                ibis.sort((a, b) => a - b);
                let medianPeriod = clampPeriod(ibis[Math.floor(ibis.length / 2)]);
                if (lastPeriodRef.current > 0 && conf >= 0.45) {
                  const octaveCandidates = [0.5, 1, 2]
                    .map((m) => clampPeriod(medianPeriod * m))
                    .sort((a, b) => a - b);
                  const currentRel =
                    Math.abs(medianPeriod - lastPeriodRef.current) / lastPeriodRef.current;
                  let bestPeriod = medianPeriod;
                  let bestRel = currentRel;
                  for (const candidate of octaveCandidates) {
                    const rel =
                      Math.abs(candidate - lastPeriodRef.current) / lastPeriodRef.current;
                    if (rel < bestRel) {
                      bestRel = rel;
                      bestPeriod = candidate;
                    }
                  }
                  if (currentRel > 0.3 && bestRel < currentRel * 0.7) {
                    medianPeriod = bestPeriod;
                  }
                }
                const lastBeatTime = t[beats[beats.length - 1]];

                // PLP phase for sub-period nudging.
                const plp = plpPhase(envForBeats, medianPeriod / frameMs);

                // Confidence: tempogram prominence × period stability × phase coherence.
                const tempoConf = Math.max(0, Math.min(1, tempo.prominence));
                let consistency = 0.5;
                if (lastPeriodRef.current > 0) {
                  const rel =
                    Math.abs(medianPeriod - lastPeriodRef.current) /
                    lastPeriodRef.current;
                  consistency = Math.exp(-rel * 10);
                }
                const dpConf = Math.cbrt(
                  Math.max(0, tempoConf) *
                    Math.max(0, consistency) *
                    Math.max(0.05, plp.coherence),
                );
                const cAlpha = conf >= 0.7 ? 0.15 : 0.35;
                conf = conf * (1 - cAlpha) + dpConf * cAlpha;
                confidenceRef.current = conf;
                lastPeriodRef.current = medianPeriod;

                // Project the last DP beat forward to land just after `now`.
                let nextBeat = lastBeatTime + medianPeriod;
                while (nextBeat < now) nextBeat += medianPeriod;

                if (!running) {
                  running = true;
                  periodRef.current = medianPeriod;
                  nextBeatAtRef.current = nextBeat;
                  phaseErrorRef.current = 0;
                } else {
                  const oldPeriod = periodRef.current;
                  // Period adaptation — gentler when confident.
                  const beta = conf >= 0.7 ? 0.05 : conf >= 0.4 ? 0.2 : 0.5;
                  periodRef.current = clampPeriod(
                    oldPeriod + (medianPeriod - oldPeriod) * beta,
                  );
                  // Phase adaptation — nudge if close, snap if far + confident.
                  const error = nextBeat - nextBeatAtRef.current;
                  phaseErrorRef.current = error;
                  const tol = oldPeriod * 0.1;
                  if (Math.abs(error) < tol) {
                    const alpha = conf >= 0.7 ? 0.1 : 0.3;
                    nextBeatAtRef.current += error * alpha;
                  } else if (conf >= 0.5) {
                    nextBeatAtRef.current = nextBeat;
                  } else {
                    nextBeatAtRef.current += error * 0.4;
                  }
                }
              }
            }
          }
        }
        recomputing = false;
      } else if (!audible) {
        conf = Math.max(0, conf - 0.05);
        confidenceRef.current = conf;
      }

      // Smoothed displayed BPM — heavier filtering once locked.
      const period = periodRef.current;
      const dispLerp = conf >= 0.7 ? 0.04 : conf >= 0.4 ? 0.12 : 0.3;
      displayPeriodRef.current =
        displayPeriodRef.current + (period - displayPeriodRef.current) * dispLerp;
      const displayedBpm = running ? Math.round(60000 / displayPeriodRef.current) : 0;

      let status: BpmStatus;
      if (!running) {
        status =
          lastBass < SILENT_BASS && lastFluxRef.current < SILENT_FLUX
            ? "silent"
            : "listening";
      } else if (elapsed < 2000) {
        status = "listening";
      } else if (conf < 0.35) {
        status = "detecting";
      } else {
        status = "locked";
      }

      setState({
        bpm: displayedBpm,
        beatIndex: beatIdxRef.current,
        beatCount: beatCountRef.current,
        status,
        beatTimes: metronomeBeatsRef.current.slice(),
        windowMs: WINDOW_MS,
        lastComputeAt: now,
        lastBass,
        period: displayPeriodRef.current,
        phaseErrorMs: phaseErrorRef.current,
        confidence: conf,
      });

      // Recompute cadence: faster while searching, slower once locked.
      const nextDelay = conf >= 0.7 ? 2000 : 750;
      recomputeTimerRef.current = window.setTimeout(recompute, nextDelay);
    };

    rafRef.current = requestAnimationFrame(tick);
    recomputeTimerRef.current = window.setTimeout(recompute, 800);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
      analyser.smoothingTimeConstant = previousSmoothing;
    };
  }, [analyser, enabled, trackKey]);

  return state;
};
