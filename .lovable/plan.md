
# Adaptive Low-Power Mode for Visualizer

Add automatic FPS-based quality scaling to `src/components/Visualizer.tsx` so all scenes (starfield, particles, bars, tunnel, rings, plasma) gracefully degrade on slow devices instead of dropping frames.

## Behavior

- **Tiers**: `high` (default), `medium`, `low`. Start at `high`. Devices already flagged `isFirefox` start at `medium` to preserve the current guardrails.
- **Sampling**: keep a rolling average of frame delta (EMA over ~60 frames). Convert to FPS once per second.
- **Downgrade** when smoothed FPS < 45 sustained for ~1.5s. **Upgrade** when smoothed FPS > 55 sustained for ~5s (asymmetric to avoid oscillation). Cooldown of 3s after any tier change.
- Tier changes re-seed `starsRef` / `particlesRef` / clear `cometsRef` + `sparklesRef` to the new caps (same pattern used today when the canvas resizes).

## Scaling table

| Knob | high | medium | low |
|---|---|---|---|
| `STAR_COUNT` | 400 | 240 | 140 |
| `PARTICLE_COUNT` | 220 | 130 | 70 |
| `MAX_COMETS` | 24 | 14 | 6 |
| `MAX_SPARKLES` | 40 | 22 | 10 |
| `dpr` cap | 2 | 1.5 | 1 |
| `glow()` multiplier | 1× | 0.5× | 0 (like Firefox) |
| Nebula radial gradient | on | on | off (flat rect) |
| Bars slices | 36 | 28 | 20 |
| Tunnel sides | 14 | 12 | 10 |
| Tunnel ring/seg cutoff | 0.05 / 0.02 | 0.10 / 0.05 | 0.18 / 0.10 |
| Hue bucketing (tunnel) | 360 | 60 | 30 |
| Beat comet spawn | 1–3 | 1–2 | 0–1 |
| Ambient comet trickle | ~1/400ms | ~1/700ms | off |
| Sparkle spike threshold | avg×1.4 | avg×1.7 | avg×2.2 |

Firefox continues to use the existing `isFirefox` branches; the tier just clamps things further. A device already in `low` uses the Firefox-style flat/no-glow paths regardless of browser.

## Implementation notes

- Add a `qualityRef = useRef<'high'|'medium'|'low'>(isFirefox ? 'medium' : 'high')` and a small `fpsMonitor` object (last-tick timestamp, EMA delta, above/below timers, cooldown timer) inside the existing `useEffect` in `Visualizer.tsx`. No new files, no new deps.
- Replace the hard-coded `MAX_COMETS`, `MAX_SPARKLES`, `STAR_COUNT`, `PARTICLE_COUNT`, `dpr`, `glow()` values with lookups from a `qualityProfile(quality, isFirefox)` helper defined at the top of the effect.
- The main `render()` loop reads `qualityRef.current` each frame — cheap ref read, no rerender.
- On tier change: recompute the profile, re-seed star/particle pools to new counts (truncate or pad), clear comets/sparkles, and update the canvas backing size for the new `dpr` cap (reuse the existing `resize()` function).
- No prop changes to `Visualizer`. No new user setting in this pass — fully automatic. (A manual override in settings can be added later if wanted.)
- Keep a `console.debug` line when the tier changes so `PlaybackDiagnostics` / devtools users can see it, but no UI surface.

## Files touched

- `src/components/Visualizer.tsx` — only file modified.

## Out of scope

- No changes to `useAudioLevel`, `useBeat`, `Cracktro`, or settings UI.
- No persisted user preference for quality tier.
- No changes to other animation-heavy components (goose family, boing ball) — can be a follow-up if the user wants.
