
# Starfield Visualizer Enhancements

Enhance the existing `starfield` mode in `src/components/Visualizer.tsx` so it becomes an audio-reactive scene instead of a silent star flight. All work stays in that single file to avoid touching unrelated logic.

## Changes

### 1. Audio sampling for starfield
Currently `renderStarfield` ignores the analyser. Call `sampleAudio()` each frame to get `{ bass, mid, treble, rms, beat }`.

Per the request, shift the "bass-driven" reactivity a bit higher up the spectrum. Introduce a `lowMid` band inside `sampleAudio` (roughly 8–20% of bins, sitting just above the current bass band) and use `lowMid` (blended with a touch of bass) as the primary drive for starfield warp/comet spawns. Bass stays available for subtle background pulse.

### 2. Reactive star flight
- Base speed multiplied by `1 + lowMid * 2 + rms * 1.5` so the field warps forward on kicks/low-mid hits.
- Star color/lightness modulated by `treble` (cooler/whiter on highs).
- Star size gets a small boost on `beat`.

### 3. Comets (new)
Add a `Comet` pool (~24 slots) stored in a new ref. Each comet: `{ x, y, vx, vy, len, life, hue }`.
- Spawn 1–3 comets on each detected `beat`, plus a slow ambient trickle (~1 every 400ms) so idle scenes still get some.
- Comets travel across the screen with a fading tail drawn as a gradient line (start = bright hue, end = transparent). Length scales with `lowMid`.
- Recycle when off-screen or `life <= 0`.

### 4. Nebula shimmer (new, cheap)
Behind the stars, draw a very low-alpha radial gradient whose radius/opacity breathes with `mid` + `rms`. One `createRadialGradient` + one `fillRect` per frame — negligible cost, adds depth.

### 5. Shooting sparkles on treble spikes
Track a running average of `treble`; when current treble exceeds `avg * 1.4`, emit 2–4 short-lived spark particles (reuse existing `particlesRef` pool is risky since other scenes share it — use a small dedicated `sparklesRef` pool of ~40).

### 6. Firefox performance guardrails
Follow the same rules the rest of the file uses:
- Use the `glow()` helper (returns 0 on Firefox) for any `shadowBlur`.
- Cap comet count to 12 and sparkles to 20 on Firefox.
- Skip the nebula radial gradient on Firefox (fall back to a flat translucent rect).

### 7. Idle behavior
When `analyser` is null or all bands are ~0, drive `lowMid`/`beat` from a slow sine so the scene still has ambient comets and gentle warp — matches how `renderBars` handles idle.

## Technical notes

- All new state lives in `useRef` arrays initialized in the existing `useEffect`, cleared/re-seeded alongside `starsRef`/`particlesRef`.
- No new dependencies, no API changes to `Visualizer` props, no changes to `useAudioLevel` / `useBeat`.
- Frame budget stays the same order of magnitude: comets (≤24 line strokes), sparkles (≤40 tiny fills), one nebula gradient — well under current `bars`/`tunnel` cost.
- No changes to other visualizer styles, no changes to `Cracktro.tsx` or settings UI.
