# Audio Reactivity Tuning

Add a collapsible side drawer with hybrid (global + per-mode) reactivity controls so users can tune how each visualizer responds to audio.

## UI

- New "Reactivity" toggle button in the top-right cluster (near the visualizer style selector).
- Click opens a right-side slide-out drawer (shadcn `Sheet`).
- Drawer sections:
  1. **Global** (applies to every mode)
     - Master intensity (0.25x – 2.5x)
     - Bass freq range (start Hz / end Hz)
     - Low-mid freq range
     - Mid freq range
     - Treble freq range
     - Beat threshold (× rolling avg)
     - Sparkle/treble threshold (× rolling avg)
  2. **Per-mode overrides** (accordion, one panel per style: starfield, bars, plasma, oscilloscope, tunnel, rings, particles)
     - Bass gain, Mid gain, Treble gain (multipliers on the band values used by that mode)
     - Motion intensity (multiplier on that mode's speed/curvature term)
     - Glow/effect intensity (multiplier on nebula/comet/sparkle spawn where applicable)
     - "Use global" checkbox per slider
  3. Footer: **Reset to defaults** button + persistence note.
- All values live-update while sliders move.

## Data model

- New file `src/lib/reactivitySettings.ts`
  - Types: `GlobalReactivity`, `ModeReactivity`, `ReactivitySettings { global, perMode: Partial<Record<VisualizerStyle, ModeReactivity>> }`
  - `DEFAULT_REACTIVITY` matching current hard-coded values (bass 0–120 Hz mapped to bin range, beat 1.35, sparkle threshold from quality profile, all gains/intensities = 1).
  - `resolveMode(style, settings)` merges global + per-mode overrides.
- Persist to localStorage under `demo.reactivity.v1`.
- Context: `ReactivityProvider` in `src/context/ReactivityContext.tsx` exposing `{ settings, setGlobal, setModeField, resetMode, resetAll }`.

## Wiring into Visualizer

- `Visualizer` consumes `useReactivity()`.
- Replace hard-coded frequency band edges (currently derived from `bEnd`, `lmEnd`, `mEnd` at ~120/500/2000 Hz) with values computed from user freq ranges + `analyser.context.sampleRate` and `analyser.fftSize`.
- Multiply per-mode `bass/mid/treble` by `masterIntensity * (perMode.bassGain ?? 1)` etc. before feeding into each mode's render fn.
- Replace `1.35` beat multiplier with `settings.global.beatThreshold`.
- Replace `qState.profile.sparkleThreshold` with `max(profile.sparkleThreshold, settings.global.sparkleThreshold)` (quality still governs the floor for low-power mode).
- Motion/glow intensity multipliers applied where mode uses `bass * k` speed terms (tunnel forward speed, starfield drive, plasma t increment, etc.).

## Files

- new `src/lib/reactivitySettings.ts`
- new `src/context/ReactivityContext.tsx`
- new `src/components/ReactivityDrawer.tsx` (Sheet + sliders + accordion)
- edit `src/components/Visualizer.tsx` (consume settings, apply to bands + intensity)
- edit `src/pages/Index.tsx` (wrap in `ReactivityProvider`, add drawer trigger button in header cluster)
- edit `src/components/ChangelogModal.tsx` + `package.json` (0.7.2 entry noting reactivity tuning)

## Non-goals

- No changes to quality/FPS auto-tiering logic.
- No new audio analysis; only how existing bands are sliced and scaled.
- No changes to the Firefox warning banner.
