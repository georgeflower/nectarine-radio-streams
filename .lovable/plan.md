## Goal

Extend the reactivity drawer so each visualizer mode exposes controls for its **characteristic effects** (comets, sparkles, tunnel geometry, particle kick, etc.) — not just the shared gain/motion/glow sliders it has today.

## What's shared vs mode-specific

Keep the current shared per-mode block (bass/mid/treble gain, motion, glow) at the top of every mode panel. Underneath, render an **"Effects"** subsection with sliders that only apply to that mode.

## Per-mode effects to expose

| Mode | New effect sliders |
|---|---|
| Starfield | Star density, comet rate on beat (`cometBeatMax` mult), ambient comet frequency (`cometAmbientMs`), sparkle density (`maxSparkles` mult), sparkle threshold override |
| Bars | Bar count (32–96), decay/persistence (background alpha), hue spread |
| Plasma | Cell size, color-cycle speed, wave complexity mix |
| Oscilloscope | Line thickness, wave amplitude, trail persistence |
| Tunnel | Slice count mult, sides (4–12), curve amount, twist amount |
| Rings | Ray bin count (48–160), ray length mult, rotation speed |
| Particles | Beat kick strength, friction, particle count mult |

Each slider defaults to `1x` (or its current quality-profile-derived value) so untouched settings look identical to today. A "Reset {mode}" button already exists — it will also clear the new effect overrides.

## Data model changes

`src/lib/reactivitySettings.ts`
- Add an `effects: Partial<Record<string, number>>` field on `ModeReactivity` (loose keys so each mode can define its own).
- Add a typed spec map `MODE_EFFECT_SPECS: Record<VisualizerStyle, EffectSpec[]>` where `EffectSpec = { key, label, min, max, step, default, suffix? }`. This drives both the UI and the resolver.
- Extend `resolveMode` to return resolved effect values merged with defaults.
- Add `reactivityStore.setModeEffect(style, key, v)` and include effects in `resetMode`.
- Persist/migrate: new field is optional, existing localStorage loads without loss.

## UI changes

`src/components/ReactivityDrawer.tsx`
- In `ModePanel`, after the existing 5 sliders, render a divider and an **Effects** group that maps `MODE_EFFECT_SPECS[style]` to `SliderRow`s.
- If a mode has no specs (shouldn't happen for tunable list), the group is hidden.

## Visualizer wiring

`src/components/Visualizer.tsx`
- Read the resolved mode effects once per frame (already reads `settingsSnapshot`).
- Multiply / replace the corresponding constants:
  - Starfield: `qState.profile.cometBeatMax * eff.cometBeat`, `cometAmbientMs / eff.cometRate`, `maxSparkles * eff.sparkleDensity`, `starCount * eff.starDensity` (respecting existing caps `MAX_COMETS`/`MAX_SPARKLES`).
  - Bars: `bins = round(56 * eff.barCount)`, background alpha from `eff.decay`, hue offset from `eff.hueSpread`.
  - Plasma: `cell = base * eff.cellSize`, `plasmaTRef` increment scaled by `eff.colorSpeed`, wave mix by `eff.complexity`.
  - Oscilloscope: `lineWidth *= eff.thickness`, amplitude factor `eff.amplitude`, trail alpha from `eff.trail`.
  - Tunnel: `slices = round(slices * eff.sliceMult)`, `sides = clamp(round(sides * eff.sidesMult))` or direct sides slider, `curve *= eff.curve`, `twist *= eff.twist`.
  - Rings: `bins = round(96 * eff.bins)`, `len *= eff.length`, rotation term `+ t * eff.speed`.
  - Particles: kick scaled by `eff.kick`, friction from `eff.friction`, `particleCount * eff.count` on seed/reseed.
- Reseed particles / trim pools when relevant multipliers change (same pattern already used for quality changes).

## Changelog & version

- Bump `package.json` to `0.7.5`.
- Update `APP_VERSION` and add a `0.7.5` entry in `ChangelogModal.tsx`: "Per-mode effect controls — tune comets, sparkles, tunnel geometry, plasma cell size, particle kick, and more from the reactivity drawer."

## Files touched

- `src/lib/reactivitySettings.ts` — model + specs + store
- `src/components/ReactivityDrawer.tsx` — render effects group
- `src/components/Visualizer.tsx` — apply effect multipliers in each renderer
- `package.json`, `src/components/ChangelogModal.tsx` — version + changelog
