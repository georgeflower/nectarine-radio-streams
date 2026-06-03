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

const Visualizer = ({ analyser, style }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
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
    window.addEventListener("resize", resize);

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

    const renderStarfield = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = "hsla(20, 25%, 6%, 0.2)";
      ctx.fillRect(0, 0, w, h);
      const speed = 1.4 * dpr;
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
      const slices = 36;
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
        const phase = (i - (t % 1)) ;
        const z = phase + 0.4; // avoid div by 0
        const depth = z / slices; // 0..1 (near..far)
        // Path through the tunnel: sin/cos in z create twisting bends.
        const px = Math.sin(z * 0.35 + t * 0.6) * curve;
        const py = Math.cos(z * 0.28 + t * 0.4) * curve * 0.8;
        // Perspective shrink.
        const persp = 1 / z;
        const r = baseR * persp * (1 + bass * 0.25);
        const roll = z * twist + t * 0.7;
        const hue = (28 + z * 18 + t * 30 + treble * 60) % 360;
        sl.push({ x: cx + px, y: cy + py, r, roll, hue, depth });
      }

      // Connecting wireframe between consecutive slices (12-gon segments).
      const sides = 14;
      ctx.lineCap = "round";
      for (let i = 0; i < sl.length - 1; i++) {
        const a = sl[i];
        const b = sl[i + 1];
        const fade = 1 - a.depth;
        if (fade <= 0.02) continue;
        ctx.strokeStyle = `hsla(${a.hue}, 100%, ${48 + bass * 22}%, ${fade * 0.85})`;
        ctx.lineWidth = Math.max(0.5, (1.2 + bass * 1.8) * dpr * fade);
        ctx.shadowBlur = 14 * dpr * fade;
        ctx.shadowColor = `hsl(${a.hue}, 100%, 60%)`;
        ctx.beginPath();
        for (let k = 0; k < sides; k++) {
          const angA = (k / sides) * Math.PI * 2 + a.roll;
          const angB = (k / sides) * Math.PI * 2 + b.roll;
          const ax = a.x + Math.cos(angA) * a.r;
          const ay = a.y + Math.sin(angA) * a.r;
          const bx = b.x + Math.cos(angB) * b.r;
          const by = b.y + Math.sin(angB) * b.r;
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }

      // Ring outlines on each slice (subtle, foreground only).
      for (const s of sl) {
        const fade = Math.pow(1 - s.depth, 1.4);
        if (fade <= 0.05) continue;
        ctx.strokeStyle = `hsla(${s.hue}, 100%, ${60 + bass * 20}%, ${fade * 0.7})`;
        ctx.lineWidth = Math.max(0.5, (1 + bass * 2) * dpr * fade);
        ctx.shadowBlur = 12 * dpr * fade;
        ctx.shadowColor = `hsl(${s.hue}, 100%, 60%)`;
        ctx.beginPath();
        for (let k = 0; k <= sides; k++) {
          const ang = (k / sides) * Math.PI * 2 + s.roll;
          const x = s.x + Math.cos(ang) * s.r;
          const y = s.y + Math.sin(ang) * s.r;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
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

      ctx.shadowBlur = 14 * dpr;
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
        ctx.shadowBlur = 10 * dpr * p.life;
        ctx.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    const render = () => {
      switch (style) {
        case "bars": renderBars(); break;
        case "plasma": renderPlasma(); break;
        case "oscilloscope": renderOscilloscope(); break;
        case "starfield": renderStarfield(); break;
        case "tunnel": renderTunnel(); break;
        case "rings": renderRings(); break;
        case "particles": renderParticles(); break;
      }
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
    const buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as Uint8Array<ArrayBuffer>;
    const bEnd = Math.max(1, Math.floor(buf.length * 0.08));

    const tick = () => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < bEnd; i++) sum += buf[i] ?? 0;
      const bass = sum / bEnd / 255;
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
    const buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as Uint8Array<ArrayBuffer>;
    const bEnd = Math.max(1, Math.floor(buf.length * 0.08));

    const tick = () => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < bEnd; i++) sum += buf[i] ?? 0;
      const bass = sum / bEnd / 255;
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
  beatTimes: number[]; // timestamps (ms, performance.now) within window
  windowMs: number;
  lastComputeAt: number; // performance.now of last recompute (0 if never)
  lastBass: number; // 0..1 current short-term bass envelope
};

export const useBpm = (
  analyser: AnalyserNode | null,
  enabled = true,
): BpmDebug => {
  const WINDOW_MS = 10000;
  const [state, setState] = useState<BpmDebug>({
    bpm: 0,
    beatIndex: 0,
    beatCount: 0,
    status: "no-audio",
    beatTimes: [],
    windowMs: WINDOW_MS,
    lastComputeAt: 0,
    lastBass: 0,
  });
  const rafRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const shortAvgRef = useRef(0);
  const longAvgRef = useRef(0);
  const cooldownRef = useRef(0);
  const beatTimesRef = useRef<number[]>([]);
  const beatIdxRef = useRef(0);
  const beatCountRef = useRef(0);
  const lastBassRef = useRef(0);

  useEffect(() => {
    if (!analyser || !enabled) {
      setState({
        bpm: 0, beatIndex: 0, beatCount: 0,
        status: "no-audio", beatTimes: [], windowMs: WINDOW_MS,
        lastComputeAt: 0, lastBass: 0,
      });
      return;
    }
    const buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as Uint8Array<ArrayBuffer>;
    const bEnd = Math.max(1, Math.floor(buf.length * 0.1));

    const tick = () => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < bEnd; i++) sum += buf[i] ?? 0;
      const bass = sum / bEnd / 255;
      shortAvgRef.current = shortAvgRef.current * 0.6 + bass * 0.4;
      longAvgRef.current = longAvgRef.current * 0.97 + bass * 0.03;
      lastBassRef.current = shortAvgRef.current;
      if (cooldownRef.current > 0) cooldownRef.current -= 1;

      const s = shortAvgRef.current;
      const l = longAvgRef.current;
      if (s > l * 1.25 && s > 0.05 && cooldownRef.current <= 0) {
        cooldownRef.current = 8;
        const now = performance.now();
        beatTimesRef.current.push(now);
        const cutoff = now - 12000;
        while (beatTimesRef.current.length && beatTimesRef.current[0] < cutoff) {
          beatTimesRef.current.shift();
        }
        beatCountRef.current += 1;
        beatIdxRef.current = (beatIdxRef.current + 1) % 4;
        setState((st) => ({
          ...st,
          beatIndex: beatIdxRef.current,
          beatCount: beatCountRef.current,
        }));
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const recompute = () => {
      const now = performance.now();
      const cutoff = now - WINDOW_MS;
      const recent = beatTimesRef.current.filter((t) => t >= cutoff);
      const lastBass = lastBassRef.current;
      let bpm = 0;
      let status: BpmStatus;

      if (lastBass < 0.02) {
        status = "silent";
      } else if (recent.length === 0) {
        status = "listening";
      } else if (recent.length < 4) {
        status = "detecting";
      } else {
        const intervals: number[] = [];
        for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1]);
        const valid = intervals.filter((d) => d > 270 && d < 1500);
        if (valid.length < 3) {
          status = "detecting";
        } else {
          const sorted = [...valid].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          bpm = Math.round(60000 / median);
          while (bpm < 60) bpm *= 2;
          while (bpm > 180) bpm = Math.round(bpm / 2);
          status = "locked";
        }
      }

      setState((st) => ({
        ...st,
        bpm,
        status,
        beatTimes: recent.slice(),
        lastComputeAt: now,
        lastBass,
      }));
    };

    rafRef.current = requestAnimationFrame(tick);
    intervalRef.current = window.setInterval(recompute, 5000);
    // also kick an initial compute soon so status shows quickly
    const initTimer = window.setTimeout(recompute, 1000);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(initTimer);
    };
  }, [analyser, enabled]);

  return state;
};



