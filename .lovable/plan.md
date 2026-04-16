

## Plan: Audio-reactive visualizer + stream picker

Two additions, both touching the existing audio pipeline.

### 1. Stream picker (in `AudioPlayer`)

- Extend `AudioPlayer` props to accept `streams: StreamSource[]` instead of a single `src`/`label`.
- Add a `<select>` (native, styled to match the CRT panel — keeps it lightweight, no Radix needed) listing all streams as `name · bitrate kbps · type`.
- Default selection: first `https://` stream (current behavior).
- Changing the selection updates internal `selectedUrl`; if currently playing, pause + reload + play the new URL.
- Filter out non-`https://` streams in the dropdown (they'd be blocked as mixed content anyway), or show them disabled with a "(http — blocked)" hint. Going with **filter out** for simplicity.
- Update `Index.tsx` to pass the full `streams` array.

### 2. Fullscreen audio-reactive visualizer

New component `src/components/Visualizer.tsx`:
- Fixed `<canvas>` behind everything: `fixed inset-0 -z-10 pointer-events-none`.
- Receives the `HTMLAudioElement` via a ref forwarded from `AudioPlayer` (lift the audio element ref up, or expose it through a context/callback). Cleanest: `AudioPlayer` calls an `onAudioReady(el)` callback once mounted, `Index` stores it in state, passes to `Visualizer`.
- On first play, lazily create `AudioContext` + `MediaElementSource(audio)` + `AnalyserNode` (fftSize 256, ~128 freq bins) + connect `source → analyser → ctx.destination`. Guard against re-creating the source (Web Audio only allows one `MediaElementSource` per element — store it on a ref).
- `requestAnimationFrame` loop reads `getByteFrequencyData` and renders a **starfield** that reacts to audio:
  - ~400 stars with `(x, y, z, baseSpeed)`, perspective-projected from origin.
  - Per-frame speed multiplier = `1 + bassEnergy * 4` where `bassEnergy = avg(freqData[0..8]) / 255`.
  - Star color shifts with mid energy (HSL hue); trail length with treble.
  - Amber/primary palette to match the existing CRT theme (`hsl(var(--primary))` base).
- Resize handler for `window.resize` + devicePixelRatio.
- When audio is paused/no signal: stars drift at slow base speed (still looks alive).
- Cleanup: cancel RAF, disconnect nodes on unmount.

### Technical notes

- `AudioContext` must be created after a user gesture → create it inside the play handler, then notify visualizer via callback or shared ref.
- Don't `close()` the AudioContext on stream change — just leave the graph; switching `audio.src` keeps the same `MediaElementSource` working.
- Plasma is tempting but starfield reads better on top of text content and matches the demoscene vibe; sticking with starfield.

### Files

- **Update** `src/components/AudioPlayer.tsx` — add streams prop, dropdown, selection state, expose audio element + analyser via callback.
- **New** `src/components/Visualizer.tsx` — canvas + RAF starfield driven by AnalyserNode.
- **Update** `src/pages/Index.tsx` — pass full `streams` to player, mount `<Visualizer>`, wire up the audio-element / analyser callback.

