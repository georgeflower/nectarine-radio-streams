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
type Comet = { x: number; y: number; vx: number; vy: number; len: number; life: number; hue: number };
type Sparkle = { x: number; y: number; vx: number; vy: number; life: number; hue: number };

type AudioSnapshot = {
  bass: number;
  lowMid: number;
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
  const cometsRef = useRef<Comet[]>([]);
  const sparklesRef = useRef<Sparkle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const plasmaTRef = useRef(0);
  const idleTRef = useRef(0);
  const tunnelTRef = useRef(0);
  const ringsTRef = useRef(0);
  const bassAvgRef = useRef(0);
  const beatCooldownRef = useRef(0);
  const trebleAvgRef = useRef(0);
  const cometAccRef = useRef(0);

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
      let lowMid = 0;
      let mid = 0;
      let treble = 0;
      let rms = 0;
      let beat = false;

      if (analyser && freq && time) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);

        const n = freq.length;
        const bEnd = Math.max(1, Math.floor(n * 0.08));
        const lmEnd = Math.max(bEnd + 1, Math.floor(n * 0.20));
        const mEnd = Math.max(lmEnd + 1, Math.floor(n * 0.38));

        let sumBass = 0;
        for (let i = 0; i < bEnd; i++) sumBass += freq[i] ?? 0;
        bass = sumBass / bEnd / 255;

        let sumLowMid = 0;
        for (let i = bEnd; i < lmEnd; i++) sumLowMid += freq[i] ?? 0;
        lowMid = sumLowMid / Math.max(1, lmEnd - bEnd) / 255;

        let sumMid = 0;
        for (let i = lmEnd; i < mEnd; i++) sumMid += freq[i] ?? 0;
        mid = sumMid / Math.max(1, mEnd - lmEnd) / 255;

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

      return { bass, lowMid, mid, treble, rms, beat, freq, time };
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

    const MAX_COMETS = isFirefox ? 12 : 24;
    const MAX_SPARKLES = isFirefox ? 20 : 40;

    const spawnComet = (w: number, h: number, drive: number, hueBase: number) => {
      if (cometsRef.current.length >= MAX_COMETS) return;
      // Enter from a random edge, aim roughly across the screen.
      const edge = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (edge === 0) { x = Math.random() * w; y = -20; }
      else if (edge === 1) { x = w + 20; y = Math.random() * h; }
      else if (edge === 2) { x = Math.random() * w; y = h + 20; }
      else { x = -20; y = Math.random() * h; }
      const tx = w / 2 + (Math.random() - 0.5) * w * 0.6;
      const ty = h / 2 + (Math.random() - 0.5) * h * 0.6;
      const ang = Math.atan2(ty - y, tx - x);
      const speed = (4 + Math.random() * 5 + drive * 8) * dpr;
      cometsRef.current.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        len: (30 + drive * 90 + Math.random() * 40) * dpr,
        life: 1,
        hue: (hueBase + Math.random() * 40) % 360,
      });
    };

    const spawnSparkle = (w: number, h: number, hueBase: number) => {
      if (sparklesRef.current.length >= MAX_SPARKLES) return;
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 2.5) * dpr;
      sparklesRef.current.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.6 + Math.random() * 0.4,
        hue: (hueBase + Math.random() * 60) % 360,
      });
    };

    const renderStarfield = (dt: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const dtScale = dt / (1000 / 60);
      const audio = sampleAudio();
      const hasAudio = !!analyser;

      idleTRef.current += 0.02;
      const idleBeat = !hasAudio && Math.sin(idleTRef.current * 0.9) > 0.985;
      const lowMid = hasAudio ? audio.lowMid : 0.15 + 0.1 * Math.sin(idleTRef.current * 0.7);
      const bass = hasAudio ? audio.bass : 0;
      const mid = hasAudio ? audio.mid : 0.1;
      const treble = hasAudio ? audio.treble : 0.05;
      const rms = hasAudio ? audio.rms : 0.05;
      const beat = hasAudio ? audio.beat : idleBeat;

      // Treble spike tracking for sparkles
      const tAvg = trebleAvgRef.current;
      trebleAvgRef.current = tAvg * 0.9 + treble * 0.1;
      const trebleSpike = treble > tAvg * 1.4 && treble > 0.12;

      // Background trail
      ctx.fillStyle = `hsla(20, 25%, 6%, ${0.18 + bass * 0.08})`;
      ctx.fillRect(0, 0, w, h);

      // Nebula shimmer
      if (!isFirefox) {
        const nebR = Math.max(w, h) * (0.35 + mid * 0.25 + rms * 0.2);
        const neb = ctx.createRadialGradient(cx, cy, 0, cx, cy, nebR);
        const nebHue = (260 + treble * 80) % 360;
        neb.addColorStop(0, `hsla(${nebHue}, 90%, 55%, ${0.06 + mid * 0.12})`);
        neb.addColorStop(0.5, `hsla(${(nebHue + 40) % 360}, 90%, 40%, ${0.03 + rms * 0.08})`);
        neb.addColorStop(1, "hsla(20, 25%, 6%, 0)");
        ctx.fillStyle = neb;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = `hsla(${(260 + treble * 80) % 360}, 90%, 50%, ${0.03 + mid * 0.05})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Stars
      const baseSpeed = 1.4 * dpr;
      const drive = lowMid * 0.75 + bass * 0.25;
      const speed = baseSpeed * dtScale * (1 + drive * 2 + rms * 1.5);
      const beatBoost = beat ? 1.5 : 1;
      const starHue = (28 + treble * 120) % 360;
      const starLight = 60 + treble * 20;

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
        const depth = 1 - s.z / MAX_DEPTH;
        const size = depth * 3 * dpr * beatBoost + 0.5;
        const alpha = Math.min(1, depth * 0.7 + treble * 0.2);
        ctx.fillStyle = `hsla(${starHue}, 100%, ${starLight}%, ${alpha})`;
        ctx.fillRect(px, py, size, size);
      }

      // Comet spawns: on beats + ambient trickle driven by lowMid
      if (beat) {
        const n = 1 + Math.floor(drive * 3);
        for (let i = 0; i < n; i++) spawnComet(w, h, drive, (28 + treble * 200) % 360);
      }
      cometAccRef.current += dt * (0.7 + lowMid * 2.5);
      while (cometAccRef.current > 400) {
        cometAccRef.current -= 400;
        spawnComet(w, h, drive * 0.6 + 0.2, (200 + Math.random() * 160) % 360);
      }

      // Draw + update comets
      const comets = cometsRef.current;
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.x += c.vx * dtScale;
        c.y += c.vy * dtScale;
        c.life -= 0.006 * dtScale;
        const tailX = c.x - c.vx * (c.len / Math.hypot(c.vx, c.vy || 1));
        const tailY = c.y - c.vy * (c.len / Math.hypot(c.vx, c.vy || 1));
        const grad = ctx.createLinearGradient(c.x, c.y, tailX, tailY);
        grad.addColorStop(0, `hsla(${c.hue}, 100%, 75%, ${c.life})`);
        grad.addColorStop(0.4, `hsla(${c.hue}, 100%, 60%, ${c.life * 0.5})`);
        grad.addColorStop(1, `hsla(${c.hue}, 100%, 60%, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = (1.5 + drive * 2) * dpr;
        ctx.lineCap = "round";
        ctx.shadowBlur = glow(10 * dpr);
        ctx.shadowColor = `hsl(${c.hue}, 100%, 65%)`;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        // Head
        ctx.fillStyle = `hsla(${c.hue}, 100%, 85%, ${c.life})`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, (1.5 + drive * 2) * dpr, 0, Math.PI * 2);
        ctx.fill();
        if (
          c.life <= 0 ||
          c.x < -50 || c.x > w + 50 ||
          c.y < -50 || c.y > h + 50
        ) {
          comets.splice(i, 1);
        }
      }
      ctx.shadowBlur = 0;

      // Sparkles on treble spikes
      if (trebleSpike) {
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) spawnSparkle(w, h, (40 + treble * 200) % 360);
      }
      const sparkles = sparklesRef.current;
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const p = sparkles[i];
        p.x += p.vx * dtScale;
        p.y += p.vy * dtScale;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= 0.02 * dtScale;
        if (p.life <= 0) { sparkles.splice(i, 1); continue; }
        const sz = (1.2 + treble * 2) * dpr * p.life;
        ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${p.life})`;
        ctx.shadowBlur = glow(8 * dpr * p.life);
        ctx.shadowColor = `hsl(${p.hue}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
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

