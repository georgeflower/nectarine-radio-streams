/**
 * Synthetic audio reactivity.
 *
 * On mobile the Web Audio graph is intentionally never built (plain HTML5
 * media keeps playing while backgrounded), so there is no AnalyserNode and
 * every visualizer sits perfectly still. This module produces a deterministic,
 * musically-plausible stand-in: a beat grid derived from a per-song seed, an
 * exponential kick envelope, non-harmonic LFO bands and a 4-bar swell.
 *
 * Everything here is pure and deterministic given (nowMs, seed) — no
 * Math.random(), no DOM, no timers.
 */

export type FakeAudioState = { playing: boolean; songId: string | null };

let state: FakeAudioState = { playing: false, songId: null };

export const setFakeAudioState = (s: FakeAudioState): void => {
  state = s;
};

export const getFakeAudioState = (): FakeAudioState => state;

/** Cheap deterministic string hash (FNV-1a style, kept in 32-bit range). */
export const hashSeed = (songId: string): number => {
  let h = 2166136261;
  for (let i = 0; i < songId.length; i++) {
    h ^= songId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Deterministic 0..1 value from an integer, for jitter and per-bin noise. */
const rand01 = (n: number): number => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Tempo for a song seed: 100..160 BPM. */
export const bpmForSeed = (seed: number): number => 100 + rand01(seed) * 60;

/** Four independent LFO phase offsets (radians) for a song seed. */
export const phasesForSeed = (seed: number): [number, number, number, number] => [
  rand01(seed + 1) * Math.PI * 2,
  rand01(seed + 2) * Math.PI * 2,
  rand01(seed + 3) * Math.PI * 2,
  rand01(seed + 4) * Math.PI * 2,
];

export type FakeSample = {
  bass: number;
  lowMid: number;
  mid: number;
  treble: number;
  rms: number;
  beat: boolean;
};

const TAU = Math.PI * 2;

/** Sum of three non-harmonic LFOs, normalised to 0..1. */
const band = (t: number, phase: number, scale: number): number => {
  const v =
    Math.sin(TAU * 0.31 * scale * t + phase) +
    Math.sin(TAU * 0.53 * scale * t + phase * 1.7) +
    Math.sin(TAU * 0.87 * scale * t + phase * 2.3);
  return (v / 3 + 1) / 2;
};

/**
 * Snapshot of the synthetic mix at nowMs. `beat` is true only on the frame
 * that crosses a beat boundary (tracked per-seed so callers can poll freely).
 */
const lastBeatIndex = new Map<number, number>();

export const sampleFake = (nowMs: number, seed: number, bpm: number): FakeSample => {
  const t = nowMs / 1000;
  const beatMs = 60000 / bpm;
  const phases = phasesForSeed(seed);

  // Beat grid with deterministic +/-12ms jitter so it is not metronomic.
  const rawIndex = Math.floor(nowMs / beatMs);
  const jitter = (rand01(seed + rawIndex * 7919) - 0.5) * 24;
  const beatStartMs = rawIndex * beatMs + jitter;
  const sinceBeat = nowMs - beatStartMs;
  const index = sinceBeat >= 0 ? rawIndex : rawIndex - 1;
  const prevJitter = (rand01(seed + index * 7919) - 0.5) * 24;
  const elapsed = Math.max(0, nowMs - (index * beatMs + prevJitter));

  const prev = lastBeatIndex.get(seed);
  const beat = prev !== index;
  lastBeatIndex.set(seed, index);

  // Kick: exponential decay from 1.0 over ~150ms. Reads as a hit, not a throb.
  const bass = Math.exp(-elapsed / 150);

  // 4-bar (16 beat) swell so the motion has phrasing.
  const swellPos = ((index % 16) + elapsed / beatMs) / 16;
  const swell = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(TAU * swellPos));

  const lowMid = band(t, phases[0], 1) * swell;
  const mid = band(t, phases[1], 1.4) * swell;
  const treble = band(t, phases[2], 2.1) * swell;
  const rms = (0.35 + 0.4 * band(t, phases[3], 0.8)) * swell;

  return {
    bass: Math.min(1, bass * swell + 0.05),
    lowMid: Math.min(1, lowMid),
    mid: Math.min(1, mid),
    treble: Math.min(1, treble),
    rms: Math.min(1, rms),
    beat,
  };
};

/**
 * Fill a frequency-style byte buffer: 1/f rolloff shaped by the band values,
 * deterministic per-bin noise, and a beat-driven low-end boost.
 */
export const fillFakeSpectrum = (
  buf: Uint8Array,
  bands: FakeSample,
  seed: number,
  nowMs: number,
): void => {
  const n = buf.length;
  const noiseFrame = Math.floor(nowMs / 33);
  for (let i = 0; i < n; i++) {
    const f = i / n;
    // Band weighting across the spectrum.
    let level: number;
    if (f < 0.08) level = bands.bass;
    else if (f < 0.25) level = bands.lowMid;
    else if (f < 0.6) level = bands.mid;
    else level = bands.treble;

    const rolloff = 1 / (1 + f * 8); // 1/f-ish
    const noise = (rand01(seed + i * 2654435761 + noiseFrame) - 0.5) * 0.18;
    const lowBoost = f < 0.06 ? bands.bass * 0.5 * (1 - f / 0.06) : 0;
    const v = (level * rolloff + lowBoost + noise) * 255 * 1.8;
    buf[i] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }
};

/** Fill a waveform byte buffer centred on 128, scaled by rms. */
export const fillFakeWaveform = (buf: Uint8Array, rms: number, nowMs: number): void => {
  const n = buf.length;
  const t = nowMs / 1000;
  const amp = 110 * Math.min(1, Math.max(0, rms));
  for (let i = 0; i < n; i++) {
    const p = (i / n) * TAU;
    const v =
      Math.sin(p * 3 + t * 2.1) * 0.6 +
      Math.sin(p * 7 + t * 1.3) * 0.3 +
      (rand01(i + Math.floor(t * 30)) - 0.5) * 0.18;
    const s = 128 + v * amp;
    buf[i] = s < 0 ? 0 : s > 255 ? 255 : s | 0;
  }
};
