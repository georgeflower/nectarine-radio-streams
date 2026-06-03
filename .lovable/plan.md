## Goal

Bring `useBpm` closer to `librosa.beat.beat_track` by adopting its three signature pieces — a **log-mel onset strength envelope**, an **autocorrelation tempo estimate weighted by a log-Gaussian prior around 125 BPM**, and a **dynamic-programming beat tracker** — and use the result to lock the existing phase-locked metronome.

librosa runs offline on the whole file; we can't. The adaptation is to run the same math on a rolling window (~8 s) every ~1 s and feed the result into the metronome we already have, which keeps ticking between updates.

## What changes vs today

Today `useBpm` does:
- raw spectral flux per frame
- whitened peak picking → onsets
- phase/period nudges from median inter-onset
- coarse autocorrelation only as a re-seed safety net

The librosa-style upgrade:
1. **Onset strength** — replace raw flux with log-mel flux: build a small fixed mel filterbank (≈40 bands, 0–8 kHz), apply `log1p` to each band, sum positive frame-to-frame differences, half-wave rectify, normalize. This is exactly `librosa.onset.onset_strength` at low cost and is far more reliable on chip/synth music than full-spectrum flux.
2. **Tempo estimate** — every ~1 s, autocorrelate the last ~8 s of onset envelope. Multiply the autocorrelation by a **log-Gaussian prior**: `exp(-0.5 · ((log2(bpm/125) / 1.0))²)` (librosa defaults, with our 125 BPM seed). Pick the peak in 60–200 BPM. This is what librosa does in `librosa.beat.tempo`.
3. **DP beat tracker** — over the same 8 s onset envelope at the estimated period `P`, run Ellis' DP:
   - score[i] = onset[i] + max over j<i of (score[j] − λ · (log((i−j)/P))²)
   - backtrack from the best end frame to get a beat sequence
   - λ ≈ 100 (librosa's `tightness=100` default)
   This gives a clean, globally-consistent beat grid for the window, immune to single-onset noise.
4. **Drive the metronome from the DP grid** — take the last DP beat time + period as the new phase reference. If it agrees with the current metronome within ±period·0.1, just nudge (`alpha` small) so the click stays smooth. If it disagrees beyond that and the DP confidence is high, snap.
5. **Confidence** — derived from how strong the chosen autocorrelation peak is vs the rest, and how consistent successive DP grids are. Replaces the current heuristic confidence so the existing "don't update often once confident" behavior still works.

The existing metronome rAF loop, lazy-start on first audio, silence detection, octave folding, displayed-BPM smoothing, and debug panel all stay. Only the onset extractor, the prior-weighted tempo estimator, and the DP beat selector are new/replaced.

## Technical notes

- **Mel filterbank** — precomputed once: 40 triangular filters over the analyser's `frequencyBinCount` linear bins, mel-spaced 0–8 kHz. Stored as `Float32Array[]` of bin-weights so per-frame cost is one dot product per band.
- **Onset envelope buffer** — circular `Float32Array` sized to 8 s at the rAF rate (~60 Hz → 480 samples). Cheap.
- **Autocorrelation** — only lags corresponding to 60–200 BPM (≈ 18–60 frames at 60 Hz). ~40 lags × 480 samples ≈ 19 k mults every second. Trivial.
- **Prior** — `weight(lag) = exp(-0.5 · (log2(bpmAtLag/125))²)`, applied as a multiplier on the autocorrelation before peak-picking.
- **DP** — O(N·W) where N≈480 frames, W ≈ ±20% of P ≈ ~20 frames → ~10 k ops per recompute. Also trivial.
- **Re-seed cadence** — DP runs at most once per second; metronome rAF keeps ticking at 60 Hz between updates. Once `confidence > 0.7`, DP recomputes drop to once every ~2 s to satisfy the "don't update often when confident" rule.
- **No new deps**, no audio worklet, no change to `Visualizer` rendering, `Cracktro`, audio routing, or the debug panel layout (same fields: `bpm`, `period`, `confidence`, `phaseErrorMs`, `windowMs`, `beatTimes`, `lastBass`).

## Files touched

- `src/components/Visualizer.tsx` — replace the onset extractor and the autocorrelation/re-seed block inside `useBpm` with the mel-flux + prior-weighted autocorr + DP beat tracker. Wire its output into the existing metronome state.

## Non-goals

- No librosa runtime in the browser (it's Python/C). We port the algorithm, not the package.
- No change to UI, visual styles, scrollers, or audio pipeline.
- No offline/whole-track analysis — strictly the rolling-window adaptation.
