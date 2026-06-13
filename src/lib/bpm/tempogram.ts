// BPM helper module — multi-band onset, fused tempogram, octave-aware
// tempo picking, PLP phase estimate, and Ellis DP beat tracking.
//
// References:
//   - Davies & Plumbley, "Context-dependent beat tracking" (2007)
//   - Ellis, "Beat tracking by dynamic programming" (2007)
//   - Grosche & Müller, "A predominant local pulse-based method for
//     the extraction of tempo and beats from polyphonic music" (2011)
//   - Böck et al., "Evaluating the online capabilities of onset detection
//     methods" (2012)
//   - librosa.beat / librosa.onset implementations
//
// Designed for short streaming windows (~10 s of onset envelope at ~12 ms hop).

export const BPM_MIN = 60;
export const BPM_MAX = 200;
export const TEMPO_PRIOR_CENTER = 120;

// ─── Band definitions (Hz) used to build the multi-band onset envelope. ───
export const BANDS: ReadonlyArray<readonly [number, number]> = [
  [20, 120],     // sub-bass — kicks
  [120, 500],    // low — bass / toms
  [500, 2000],   // mid — snares, plucks, vocals
  [2000, 8000],  // high — hats, cymbals, leads
];

// ─── Per-band log-magnitude flux (one frame). ───
// `mag` is linear magnitude per FFT bin. Writes positive-flux values into
// `outBands` (length = BANDS.length), updating `prevBands` in place.
export function bandFlux(
  mag: Float32Array,
  sampleRate: number,
  prevBands: Float32Array,
  outBands: Float32Array,
): void {
  const nBins = mag.length;
  const binHz = sampleRate / 2 / nBins;
  for (let b = 0; b < BANDS.length; b++) {
    const [lo, hi] = BANDS[b];
    const i0 = Math.max(1, Math.floor(lo / binHz));
    const i1 = Math.min(nBins - 1, Math.ceil(hi / binHz));
    let sum = 0;
    for (let i = i0; i <= i1; i++) sum += mag[i];
    // log compression, then flux against previous frame value
    const logE = Math.log1p(sum);
    const d = logE - prevBands[b];
    outBands[b] = d > 0 ? d : 0;
    prevBands[b] = logE;
  }
}

// ─── Adaptive whitening (per-band, in place). Subtracts local mean,
// divides by local std — kills slow drifts and equalizes dynamics. ───
export function whitenInPlace(src: Float32Array, win = 24): Float32Array {
  const n = src.length;
  if (n === 0) return src;
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
    src[i] = x > 0 ? x : 0;
  }
  return src;
}

// ─── Fuse multi-band envelopes: equal-weight sum + max-band fallback. ───
export type FusedEnvelopes = {
  fused: Float32Array;
  maxBand: Float32Array;
  meanEnergy: number;
};

export function fuseBandEnvelopes(bands: Float32Array[]): FusedEnvelopes {
  const B = bands.length;
  const N = bands[0]?.length ?? 0;
  const fused = new Float32Array(N);
  const maxBand = new Float32Array(N);
  let energy = 0;
  for (let i = 0; i < N; i++) {
    let s = 0;
    let m = 0;
    for (let b = 0; b < B; b++) {
      const v = bands[b][i];
      s += v;
      if (v > m) m = v;
    }
    fused[i] = s / B;
    maxBand[i] = m;
    energy += fused[i];
  }
  return { fused, maxBand, meanEnergy: energy / Math.max(1, N) };
}

// ─── Rayleigh prior over BPM, peaked near TEMPO_PRIOR_CENTER. ───
// Broader than a Gaussian — gives 70-180 BPM a fair chance.
export function rayleighPrior(bpm: number): number {
  const sigma = TEMPO_PRIOR_CENTER / Math.SQRT2; // mode = sigma * sqrt(2/pi) doesn't matter; just shape
  // Use a shifted log-Rayleigh-like curve so the prior is mild.
  // p(bpm) ∝ bpm * exp(-bpm^2 / (2*sigma^2)) — Rayleigh in BPM
  const x = bpm;
  const v = (x / (sigma * sigma)) * Math.exp(-(x * x) / (2 * sigma * sigma));
  // Normalize so peak ≈ 1
  const peakX = sigma; // mode of Rayleigh
  const peak = (peakX / (sigma * sigma)) * Math.exp(-0.5);
  return v / peak;
}

// ─── Autocorrelation tempogram for lags in [minLag, maxLag] (samples). ───
export function autocorrTempogram(
  env: Float32Array,
  minLag: number,
  maxLag: number,
): Float32Array {
  const n = env.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const s = new Float32Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    s[i] = env[i] - mean;
    norm += s[i] * s[i];
  }
  const out = new Float32Array(maxLag + 1);
  if (norm < 1e-6) return out;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let i = lag; i < n; i++) ac += s[i] * s[i - lag];
    out[lag] = ac / norm;
  }
  return out;
}

// ─── Fourier tempogram: DFT magnitude at each candidate period.
// Matches Grosche/Müller's "cyclic tempogram" idea but evaluated only at
// the lags we care about. O(N*K) like autocorr; cheap at K~140. ───
export function fourierTempogram(
  env: Float32Array,
  minLag: number,
  maxLag: number,
): Float32Array {
  const n = env.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const out = new Float32Array(maxLag + 1);
  let energy = 0;
  for (let i = 0; i < n; i++) energy += (env[i] - mean) * (env[i] - mean);
  if (energy < 1e-6) return out;
  const invNorm = 1 / Math.sqrt(energy);
  for (let lag = minLag; lag <= maxLag; lag++) {
    const w = (2 * Math.PI) / lag;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const x = env[i] - mean;
      re += x * Math.cos(w * i);
      im += x * Math.sin(w * i);
    }
    out[lag] = (Math.sqrt(re * re + im * im) * invNorm) / Math.sqrt(n);
  }
  return out;
}

// ─── Pick best period using fused tempogram + octave-family scoring.
// Returns the period (in samples) and a 0..1 strength estimate. ───
export type TempoPick = { lag: number; bpm: number; strength: number; prominence: number } | null;

export function pickTempo(
  env: Float32Array,
  frameMs: number,
): TempoPick {
  const minLag = Math.max(2, Math.floor(60000 / BPM_MAX / frameMs));
  const maxLag = Math.min(Math.floor(env.length * 0.6), Math.ceil(60000 / BPM_MIN / frameMs));
  if (maxLag <= minLag) return null;

  const acf = autocorrTempogram(env, minLag, Math.min(maxLag * 2, env.length - 1));
  const ftf = fourierTempogram(env, minLag, maxLag);

  // Geometric mean of (clamped) tempograms — emphasizes peaks both methods agree on.
  // Weight by a broad Rayleigh prior in BPM.
  const score = new Float32Array(maxLag + 1);
  let sumScore = 0;
  let countScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const a = Math.max(0, acf[lag] ?? 0);
    const f = Math.max(0, ftf[lag] ?? 0);
    const fused = Math.sqrt(a * f + 1e-9);
    const bpm = 60000 / (lag * frameMs);
    const prior = rayleighPrior(bpm);
    score[lag] = fused * prior;
    sumScore += score[lag];
    countScore++;
  }
  const meanScore = sumScore / Math.max(1, countScore);

  // Octave-aware family scoring: pick the lag whose family (P/2, P, 3P/2, 2P)
  // accumulates the most evidence. Avoids picking the half/double-tempo peak.
  const acfAt = (lag: number): number => {
    if (lag < minLag || lag >= acf.length) return 0;
    return Math.max(0, acf[Math.round(lag)] ?? 0);
  };
  const ftfAt = (lag: number): number => {
    if (lag < minLag || lag > maxLag) return 0;
    return Math.max(0, ftf[Math.round(lag)] ?? 0);
  };
  const familyScore = (lag: number): number => {
    const base = score[lag] ?? 0;
    const harm = (m: number, w: number) => {
      const L = lag * m;
      const f = Math.sqrt(acfAt(L) * ftfAt(L) + 1e-9);
      const bpm = 60000 / (L * frameMs);
      return w * f * rayleighPrior(bpm);
    };
    return (
      base +
      harm(2, 0.5) +
      harm(0.5, 0.5) +
      harm(1.5, 0.3) +
      harm(3, 0.2)
    );
  };

  let bestLag = minLag;
  let bestFamily = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const fs = familyScore(lag);
    if (fs > bestFamily) {
      bestFamily = fs;
      bestLag = lag;
    }
  }
  const strength = score[bestLag];
  const prominence = (strength - meanScore) / (Math.abs(meanScore) + 1e-6);
  return {
    lag: bestLag,
    bpm: 60000 / (bestLag * frameMs),
    strength: Math.max(0, Math.min(1, strength)),
    prominence: Math.max(0, Math.min(2, prominence)),
  };
}

// ─── Ellis dynamic-programming beat tracker over an onset envelope. ───
export function dpBeats(
  env: Float32Array,
  periodFrames: number,
  tightness = 100,
): number[] {
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
      const penalty = tightness * lp * lp;
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
}

// ─── PLP (predominant local pulse): correlate env with a Hann-windowed
// sinusoid at the chosen period, return phase (radians) and coherence. ───
export function plpPhase(
  env: Float32Array,
  periodFrames: number,
): { phase: number; coherence: number } {
  const n = env.length;
  if (n < periodFrames * 2 || periodFrames < 2) {
    return { phase: 0, coherence: 0 };
  }
  const winLen = Math.min(n, Math.round(periodFrames * 6));
  const start = n - winLen;
  const w = (2 * Math.PI) / periodFrames;
  let re = 0;
  let im = 0;
  let energy = 0;
  for (let i = 0; i < winLen; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winLen - 1));
    const x = env[start + i] * hann;
    re += x * Math.cos(w * i);
    im += x * Math.sin(w * i);
    energy += x * x;
  }
  const mag = Math.sqrt(re * re + im * im);
  const coherence = energy > 1e-9 ? Math.min(1, (mag * 2) / Math.sqrt(energy * winLen)) : 0;
  const phase = Math.atan2(im, re);
  return { phase, coherence };
}
