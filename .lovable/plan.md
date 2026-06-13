# Improve BPM detection (`src/components/Visualizer.tsx` → `useBpm`)

## Why the current detector misses non-kicky tracks

After reading `useBpm` (Visualizer.tsx lines ~670–1170), the weak spots are:

1. **Byte FFT input** (`getByteFrequencyData`, 0–255) — quantizes low-energy onsets (chord stabs, hi-hats, plucks) into noise. Float FFT carries ~96 dB of range.
2. **Single summed onset envelope** — mel flux is collapsed to one scalar. Tracks whose energy lives in mids/highs (acid leads, breakbeats, ambient, chiptune) get drowned by bass noise. Modern detectors (Davies/Böck, BTrack, librosa "specdiff") run **multi-band onset** and fuse.
3. **Very tight log-Gaussian prior at 125 BPM (σ≈1 octave but peak too sharp)** — pulls weak signals to 125 even when the true tempo is 90 or 170. MIREX best-practice is a **Rayleigh / broader log-normal prior** plus **explicit octave-error correction**, not a steep peak.
4. **No tempogram fusion** — only autocorrelation. Fourier tempogram (Grosche/Müller) handles syncopated/offbeat material that ACF misses; combining both is standard.
5. **Octave folding only after lock** (`foldOctave` gated by `conf ≥ 0.4`) — by the time confidence is high, we're already stuck at half/double time. Octave decision should happen **during** tempo picking by comparing the candidate against its 0.5×, 2×, and 3/2× harmonics (PLP / Davies "comb").
6. **Smoothing on the AnalyserNode** (`smoothingTimeConstant ≤ 0.4`) still blurs onsets. Onset analysis wants **0**.
7. **Frame rate tied to rAF (~60 Hz)** ⇒ tempo resolution ≈ ±2 BPM near 120 and worse at high tempos. A fixed-hop scheduler (e.g. 11.6 ms ≈ 86 Hz, librosa default) is more stable.
8. **No PLP/phase tracker** — DP grid is recomputed every 1–2 s but phase between recomputes drifts when onsets are subtle.

## What to change

All work stays inside `useBpm` and a small new helper module — no UI changes.

### 1. Better input
- Switch to `getFloatFrequencyData` (dB) and convert to linear magnitude; raise `analyser.fftSize` to 2048 (currently inherited), set `smoothingTimeConstant = 0` for the detector path.
- Keep a separate reference for the visualizer's smoothing so the existing waveform UI is unaffected (read the previous value, restore on cleanup — already done).

### 2. Multi-band onset envelope (BTrack-style)
- Compute log-mel as today, but split into **4 sub-envelopes**: sub-bass (0–120 Hz), low (120–500), mid (500–2 k), high (2 k–8 k). Half-wave-rectified flux per band, adaptive-whitened independently, then summed with equal weight into a **fused** envelope used by the tempo/DP stage. Also keep the **max-band** envelope as a secondary signal — when summed flux is flat, the strongest single band still carries the beat.
- Run tempo estimation on the fused envelope; if its peak strength is below threshold, fall back to the max-band envelope. This is the single biggest accuracy win for non-kick tracks.

### 3. Fused tempogram + explicit octave decision
- Compute **autocorrelation tempogram** (existing) and **Fourier tempogram** (magnitude of DFT of the onset envelope, mapped to BPM) over the same window; multiply them (geometric mean). This is the standard Grosche/Müller fusion and dramatically reduces octave errors.
- Replace the steep `exp(-0.5 * log2(bpm/125)^2)` prior with a **broad Rayleigh prior centered ~120 BPM** (used by Davies & Plumbley and librosa's `tempo`). Width tuned so 70–180 are all viable.
- **Octave-aware peak picking**: for each candidate period P, score = S(P) + 0.5·S(2P) + 0.5·S(P/2) + 0.3·S(3P/2). Pick the period whose octave family has the most total support, not the single tallest peak. Eliminates the classic "locks to 75 instead of 150" failure.

### 4. Tighter tracker
- Keep the Ellis DP backtrack on the fused envelope, but feed it the octave-decided period from step 3.
- Add a **PLP (predominant local pulse)** phase estimate: convolve the onset envelope with a Hann-windowed sinusoid at the chosen period and use its phase as a high-quality nudge target for `nextBeatAtRef`. This stabilizes phase between recomputes without snapping.
- Recompute every 750 ms while unlocked (faster lock-in), stretch to 2 s once `conf ≥ 0.7` (as today).

### 5. Confidence + status
- Confidence = geometric mean of (fused-tempogram peak prominence, run-to-run period stability, PLP phase coherence). Surfaces a more honest "locked" vs "detecting" indicator in the existing debug panel (no UI change needed; it already reads `status`/`confidence`).

### 6. Performance
- Tempogram autocorrelation runs on a downsampled envelope (hop ~12 ms, ~800 samples for 10 s) — same cost order as today.
- Fourier tempogram is a single 1024-pt real FFT per recompute (cheap, runs every 0.75–2 s, not per frame).

## Technical details

- New helper file `src/lib/bpm/tempogram.ts` for: multi-band onset accumulator, autocorr + Fourier tempogram, Rayleigh prior, octave-family scorer, PLP phase estimator. Keeps `Visualizer.tsx` from ballooning.
- `useBpm` keeps the same return shape (`BpmDebug`), so `src/pages/Index.tsx` and the shared `gooseBeat` store are untouched.
- Reset logic on `trackKey` change unchanged.
- All numeric constants tunable at the top of the file; defaults chosen from BTrack/librosa published values.

## Out of scope

- No new UI, no changes to `gooseBeat.ts` consumers.
- Not pulling in a heavy library (`web-audio-beat-detector` requires the full decoded buffer; we're streaming).
- No server/edge-function changes.

## Validation

- Add a Vitest unit test for `tempogram.ts`: feed synthetic onset envelopes at 90 / 128 / 174 BPM (with and without strong downbeat) and assert detected BPM within ±2.
- Manual: cycle through Nectarine streams and confirm the existing debug panel reaches `locked` on at least one demoscene chip track, one ambient track, and one breakbeat — categories the current detector mishandles.
