## Goal

Make BPM detection actually track the music by running an internal metronome that **phase-locks** to detected onsets, instead of trying to compute BPM cold from a 10-second autocorrelation every 5 seconds.

## Why this approach

The current code does two things that fight each other:
1. A bass-energy threshold detector that fires "beats" whenever the bass jumps.
2. An autocorrelation over a 10s window that picks the best 60–180 BPM.

Both produce noisy output on real demoscene/chip tracks (sparse kicks, melodic bass, irregular tempos) and rarely converge. The user's intuition — "compare to my own metronome and sync the click" — is exactly the standard real-time beat-tracking technique used in DJ software and Ellis/Large-style trackers.

Best-practice pipeline for real-time beat tracking:

1. **Onset envelope** — spectral flux across the full spectrum (sum of positive bin-to-bin energy deltas), not just bass. This works for chip/synth music where the "kick" isn't always sub-bass.
2. **Tempo estimate** — autocorrelation / comb filter of the onset envelope to find period (used only as a coarse prior, refined continuously).
3. **Phase-locked oscillator** — an internal metronome with `period` and `phase`. Every onset nudges the phase toward the nearest expected beat and adapts the period slightly. This is the "metronome that syncs" the user described.
4. **Start prior** — initialize at 125 BPM, period = 480 ms. Adapt from there.

## Plan

### 1. Rewrite `useBpm` in `src/components/Visualizer.tsx`

Replace the existing onset/autocorrelation/threshold mix with a phase-locked tracker:

- **Onset envelope** per animation frame:
  - Pull full `getByteFrequencyData`.
  - Compute spectral flux = sum of `max(0, currentBin − prevBin)` across all bins, normalized.
  - Apply a short adaptive whitening (subtract a slow moving mean, divide by slow moving std) so loud and quiet sections behave the same.
- **Onset detection**: peak in the whitened flux above a small threshold (e.g. `mean + 1.2·std`) with a 70 ms refractory period.
- **Metronome state**:
  - `period` (ms), initialized to `60000 / 125 = 480`.
  - `nextBeatAt` (performance.now ms), initialized to `now + period`.
  - `confidence` (0..1), initialized to 0.
- **On each detected onset at time `t`**:
  - Compute `error = t − nearestExpectedBeat(t)` (signed, within ±period/2).
  - **Phase correction**: `nextBeatAt += error · α` with `α ≈ 0.18` (gentle pull toward the onset, prevents jitter).
  - **Period correction**: keep a small rolling buffer of the last ~8 inter-onset intervals folded into the current period range; nudge `period += (medianFoldedInterval − period) · β` with `β ≈ 0.05`. Clamp period to 333–1000 ms (60–180 BPM) and fold octaves (×2 / ÷2) toward the current estimate to avoid half/double-time flips.
  - Bump `confidence` toward 1 when the error is small (`|error| < period · 0.08`), decay otherwise.
- **Coarse tempo prior** (runs every 4 s in the background): autocorrelation of the last 6 s of onset envelope, only used to **reset** the tracker if `confidence` stays below ~0.15 for >10 s. Prevents getting stuck on a wrong tempo without overriding a good lock.
- **Beat ticks**: a separate rAF loop advances `nextBeatAt` whenever `now ≥ nextBeatAt` and increments `beatIndex` / `beatCount`. This is the "silent metronome click" that drives the UI animations.

### 2. Update `BpmDebug` shape (minor, keep names compatible)

Keep the existing exported fields (`bpm`, `beatIndex`, `beatCount`, `status`, `beatTimes`, `windowMs`, `lastComputeAt`, `lastBass`) and add:

- `period` (ms) — current tracker period.
- `phaseErrorMs` — last onset's phase error.
- `confidence` (0..1) — tracker lock confidence.

`bpm` is derived as `Math.round(60000 / period)`.

`status` mapping:
- `no-audio` — analyser missing.
- `silent` — flux mean below floor.
- `listening` — has audio, <2 s of onsets so far.
- `detecting` — confidence < 0.35.
- `locked` — confidence ≥ 0.35.

### 3. Surface new fields in the debug panel

`src/pages/Index.tsx` already destructures `useBpm()` and renders a debug panel. Extend it to show period (ms), confidence, and last phase error so the user can see the metronome sync visually. No layout changes needed; just add three rows.

### 4. Keep BPM publicly stable

The `bpm` value shown in the header still updates once per second (smoothed), so it does not jitter even though the internal period adapts every onset.

## Non-goals

- No external libraries.
- No change to the visualizer, cracktro, or any audio routing.
- No change to the BPM indicator dot colors or layout.

## Technical notes

- All math runs in the existing rAF loop already feeding the analyser; no extra audio worklet needed.
- The metronome rAF must run even when no onsets are detected (so beats keep ticking through quiet bars).
- Octave folding rule: when a candidate new period would change BPM by more than ~25%, multiply/divide by 2 first and only accept if the folded version is closer to the current period.
- Reset rule: if `confidence < 0.15` for >10 s **and** the autocorrelation prior disagrees with current period by >15%, snap `period` to the prior and reset `nextBeatAt = now + period`.

## Files touched

- `src/components/Visualizer.tsx` — replace `useBpm` body and `estimateBpmFromSamples` helper.
- `src/pages/Index.tsx` — add 3 debug rows (period / confidence / phase error). No other UI changes.
