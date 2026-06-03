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

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const freq: Uint8Array<ArrayBuffer> | null = analyser
      ? (new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as Uint8Array<ArrayBuffer>)
      : null;
    const time: Uint8Array<ArrayBuffer> | null = analyser
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
  const TIGHTNESS = 100; // librosa default

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

  // Tracker / metronome state.
  const periodRef = useRef(INITIAL_PERIOD);
  const nextBeatAtRef = useRef(0);
  const confidenceRef = useRef(0);
  const phaseErrorRef = useRef(0);
  const beatIdxRef = useRef(0);
  const beatCountRef = useRef(0);
  const metronomeBeatsRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const lastDpPeriodRef = useRef(0);
  const lastBassRef = useRef(0);
  const lastFluxRef = useRef(0);
  const displayPeriodRef = useRef(INITIAL_PERIOD);

  useEffect(() => {
    // Reset state when track changes so BPM detection starts fresh.
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

    if (!analyser || !enabled) {
      setState((st) => ({ ...st, status: "no-audio" }));
      return;
    }
    const previousSmoothing = analyser.smoothingTimeConstant;
    analyser.smoothingTimeConstant = Math.min(previousSmoothing, 0.4);

    const NBINS = analyser.frequencyBinCount;
    const SR = analyser.context.sampleRate;
    const buf = new Uint8Array(new ArrayBuffer(NBINS)) as Uint8Array<ArrayBuffer>;
    const bassEnd = Math.max(1, Math.floor(NBINS * 0.1));

    // ----- mel filterbank (40 bands, 0..min(8kHz, sr/2)) -----
    const NMEL = 40;
    const FMAX = Math.min(8000, SR / 2);
    const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
    const melToHz = (m: number) => 700 * (Math.pow(10, m / 2595) - 1);
    const melLo = hzToMel(0);
    const melHi = hzToMel(FMAX);
    const melPts: number[] = [];
    for (let i = 0; i < NMEL + 2; i++) {
      melPts.push(melToHz(melLo + ((melHi - melLo) * i) / (NMEL + 1)));
    }
    const binFromHz = (hz: number) => (hz / (SR / 2)) * NBINS;
    type MelFilter = { start: number; weights: Float32Array };
    const filters: MelFilter[] = [];
    for (let m = 1; m <= NMEL; m++) {
      const lo = binFromHz(melPts[m - 1]);
      const mid = binFromHz(melPts[m]);
      const hi = binFromHz(melPts[m + 1]);
      const startI = Math.max(0, Math.floor(lo));
      const endI = Math.min(NBINS - 1, Math.ceil(hi));
      const w = new Float32Array(Math.max(1, endI - startI + 1));
      for (let i = startI; i <= endI; i++) {
        let v = 0;
        if (i >= lo && i <= mid) v = (i - lo) / Math.max(1e-6, mid - lo);
        else if (i >= mid && i <= hi) v = (hi - i) / Math.max(1e-6, hi - mid);
        w[i - startI] = Math.max(0, v);
      }
      filters.push({ start: startI, weights: w });
    }
    const melCur = new Float32Array(NMEL);
    const melPrev = new Float32Array(NMEL);

    // ----- onset envelope ring buffer (~10s @ ~60Hz) -----
    const FRAMES = 700;
    const envT = new Float64Array(FRAMES);
    const envV = new Float32Array(FRAMES);
    let envIdx = 0;
    let envFilled = 0;

    // ----- runtime state -----
    const now0 = performance.now();
    startedAtRef.current = now0;
    nextBeatAtRef.current = 0;
    let running = false;
    let silentSince = 0;
    const SILENT_BASS = 0.01;
    const SILENT_FLUX = 0.0005;
    const SILENT_TIMEOUT = 2500;

    const clampPeriod = (p: number) => Math.min(MAX_PERIOD, Math.max(MIN_PERIOD, p));

    const foldOctave = (candidate: number, ref: number) => {
      let p = candidate;
      while (p < ref * 0.75) p *= 2;
      while (p > ref * 1.5) p /= 2;
      return p;
    };

    // ---- rAF loop: build onset envelope + tick metronome ----
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const now = performance.now();

      // bass level (for silence detection / debug)
      let bassSum = 0;
      for (let i = 0; i < bassEnd; i++) bassSum += buf[i] ?? 0;
      lastBassRef.current = bassSum / bassEnd / 255;

      // log-mel bands
      for (let m = 0; m < NMEL; m++) {
        const f = filters[m];
        let s = 0;
        const w = f.weights;
        const start = f.start;
        for (let i = 0; i < w.length; i++) s += (buf[start + i] ?? 0) * w[i];
        melCur[m] = Math.log1p(s / 255);
      }
      // half-wave-rectified flux summed across mel bands
      let flux = 0;
      for (let m = 0; m < NMEL; m++) {
        const d = melCur[m] - melPrev[m];
        if (d > 0) flux += d;
        melPrev[m] = melCur[m];
      }
      flux /= NMEL;
      lastFluxRef.current = flux;

      // write into ring buffer
      envT[envIdx] = now;
      envV[envIdx] = flux;
      envIdx = (envIdx + 1) % FRAMES;
      if (envFilled < FRAMES) envFilled++;

      // silence -> pause metronome
      const audible = lastBassRef.current > SILENT_BASS || flux > SILENT_FLUX;
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

    // ---- copy ring buffer to linear oldest-to-newest arrays ----
    const linearizeEnv = (): { t: Float64Array; v: Float32Array } | null => {
      if (envFilled < 100) return null;
      const len = envFilled;
      const t = new Float64Array(len);
      const v = new Float32Array(len);
      const start = envFilled < FRAMES ? 0 : envIdx;
      for (let i = 0; i < len; i++) {
        const j = (start + i) % FRAMES;
        t[i] = envT[j];
        v[i] = envV[j];
      }
      return { t, v };
    };

    // ---- adaptive whitening: subtract local mean, divide by local std ----
    const whiten = (src: Float32Array): Float32Array => {
      const n = src.length;
      const out = new Float32Array(n);
      const win = Math.max(20, Math.floor(n * 0.1));
      // rolling stats via prefix sums
      const ps = new Float64Array(n + 1);
      const ps2 = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) {
        ps[i + 1] = ps[i] + src[i];
        ps2[i + 1] = ps2[i] + src[i] * src[i];
      }
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - win);
        const b = Math.min(n, i + win + 1);
        const cnt = b - a;
        const mean = (ps[b] - ps[a]) / cnt;
        const variance = Math.max(0, (ps2[b] - ps2[a]) / cnt - mean * mean);
        const std = Math.sqrt(variance) + 1e-6;
        const x = (src[i] - mean) / std;
        out[i] = x > 0 ? x : 0;
      }
      return out;
    };

    // ---- tempo via prior-weighted autocorrelation ----
    type TempoResult = { period: number; strength: number } | null;
    const estimateTempo = (env: Float32Array, frameMs: number): TempoResult => {
      const n = env.length;
      let mean = 0;
      for (let i = 0; i < n; i++) mean += env[i];
      mean /= n;
      let norm = 0;
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        s[i] = env[i] - mean;
        norm += s[i] * s[i];
      }
      if (norm < 1e-6) return null;

      const minLag = Math.max(2, Math.floor(MIN_PERIOD / frameMs));
      const maxLag = Math.min(Math.floor(n * 0.6), Math.ceil(MAX_PERIOD / frameMs));
      if (maxLag <= minLag) return null;

      let best = -Infinity;
      let bestLag = minLag;
      let sumScore = 0;
      let count = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let ac = 0;
        for (let i = lag; i < n; i++) ac += s[i] * s[i - lag];
        ac /= norm;
        const bpm = 60000 / (lag * frameMs);
        const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 125), 2));
        const w = ac * prior;
        sumScore += w;
        count++;
        if (w > best) {
          best = w;
          bestLag = lag;
        }
      }
      const meanAc = sumScore / Math.max(1, count);
      const strength = (best - meanAc) / (Math.abs(meanAc) + 1e-6);
      return { period: bestLag * frameMs, strength };
    };

    // ---- Ellis dynamic-programming beat tracker ----
    const dpBeats = (env: Float32Array, periodFrames: number): number[] => {
      const N = env.length;
      if (N < 4 || periodFrames < 2) return [];
      const score = new Float32Array(N);
      const back = new Int32Array(N);
      const wMin = Math.max(1, Math.floor(periodFrames * 0.5));
      const wMax = Math.max(wMin + 1, Math.ceil(periodFrames * 2));
      for (let i = 0; i < N; i++) {
        let bestSc = -Infinity;
        let bestJ = -1;
        const jStart = Math.max(0, i - wMax);
        const jEnd = i - wMin;
        for (let j = jStart; j <= jEnd; j++) {
          const dt = i - j;
          const lp = Math.log(dt / periodFrames);
          const penalty = TIGHTNESS * lp * lp;
          const sc = score[j] - penalty;
          if (sc > bestSc) {
            bestSc = sc;
            bestJ = j;
          }
        }
        if (bestJ < 0) {
          score[i] = env[i];
          back[i] = -1;
        } else {
          score[i] = env[i] + bestSc;
          back[i] = bestJ;
        }
      }
      // pick best end in the last ~1.5 periods
      const endStart = Math.max(0, N - Math.ceil(periodFrames * 1.5));
      let bestEnd = N - 1;
      let bestEndScore = -Infinity;
      for (let i = endStart; i < N; i++) {
        if (score[i] > bestEndScore) {
          bestEndScore = score[i];
          bestEnd = i;
        }
      }
      const beats: number[] = [];
      let k = bestEnd;
      while (k >= 0) {
        beats.push(k);
        k = back[k];
      }
      beats.reverse();
      return beats;
    };

    // ---- recompute: runs every 1-2s, updates metronome from DP grid ----
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
        const linear = linearizeEnv();
        if (linear) {
          const { t, v } = linear;
          const frameMs = (t[t.length - 1] - t[0]) / Math.max(1, t.length - 1);
          if (Number.isFinite(frameMs) && frameMs > 0 && frameMs < 100) {
            const w = whiten(v);
            const tempo = estimateTempo(w, frameMs);
            if (tempo) {
              // Fold the new period into the current period's octave band to
              // avoid half/double-time flips once we're locked.
              const oldPeriod = periodRef.current;
              const folded =
                conf >= 0.4 ? foldOctave(tempo.period, oldPeriod) : tempo.period;
              const periodFrames = folded / frameMs;
              const beats = dpBeats(w, periodFrames);
              if (beats.length >= 2) {
                const ibis: number[] = [];
                for (let i = 1; i < beats.length; i++) {
                  ibis.push(t[beats[i]] - t[beats[i - 1]]);
                }
                ibis.sort((a, b) => a - b);
                const medianPeriod = clampPeriod(ibis[Math.floor(ibis.length / 2)]);
                const lastBeatTime = t[beats[beats.length - 1]];

                // confidence: autocorr peak strength + run-to-run consistency
                const tempoConf = Math.max(0, Math.min(1, tempo.strength * 0.5));
                let consistency = 0.5;
                if (lastDpPeriodRef.current > 0) {
                  const rel =
                    Math.abs(medianPeriod - lastDpPeriodRef.current) /
                    lastDpPeriodRef.current;
                  consistency = Math.exp(-rel * 10);
                }
                const dpConf = tempoConf * 0.6 + consistency * 0.4;
                // EMA — slower changes once high
                const cAlpha = conf >= 0.7 ? 0.15 : 0.35;
                conf = conf * (1 - cAlpha) + dpConf * cAlpha;
                confidenceRef.current = conf;
                lastDpPeriodRef.current = medianPeriod;

                // Project last DP beat forward to the next beat after `now`
                let nextBeat = lastBeatTime + medianPeriod;
                while (nextBeat < now) nextBeat += medianPeriod;

                if (!running) {
                  running = true;
                  periodRef.current = medianPeriod;
                  nextBeatAtRef.current = nextBeat;
                  phaseErrorRef.current = 0;
                } else {
                  // Period adaptation — much gentler when confident.
                  const beta = conf >= 0.7 ? 0.05 : conf >= 0.4 ? 0.2 : 0.5;
                  periodRef.current = clampPeriod(
                    oldPeriod + (medianPeriod - oldPeriod) * beta
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
        // Decay confidence while silent so we re-lock fresh on resume.
        conf = Math.max(0, conf - 0.05);
        confidenceRef.current = conf;
      }

      // Smooth the displayed BPM heavily when locked.
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
      const nextDelay = conf >= 0.7 ? 2000 : 1000;
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




