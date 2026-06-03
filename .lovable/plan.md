## Add more music-reactive effects

The app already has an `AnalyserNode` wired from the audio stream into a `Visualizer` component with styles: off / starfield / bars / plasma / oscilloscope. I'll extend that pipeline with new reactive visualizer modes and add some subtle UI elements that pulse to the beat.

### New visualizer styles (in `src/components/Visualizer.tsx`)

Add four new options to the existing dropdown:

1. **Tunnel** — concentric rings warping outward from the center, ring spacing and color hue driven by bass + mid energy. Gives a classic demoscene "vortex" feel.
2. **Spectrum Rings** — circular polar-coordinate spectrum, with each frequency bin drawn as a radial spike around the center; rotation speed scales with overall RMS.
3. **Particles** — a swarm of glow particles that drift slowly and get an outward velocity kick on each detected beat (simple energy-threshold beat detector on the bass band).
4. **Waveform Mirror** — a thick mirrored oscilloscope (top + bottom reflection) with neon gradient stroke and a soft trailing afterimage (semi-transparent fill each frame).

All styles reuse the existing analyser, semantic color tokens (`--primary`, `--accent`), and the same canvas/resize/rAF scaffolding.

### Beat detection helper

Add a small shared hook/util inside `Visualizer.tsx`:
- Compute bass energy (avg of first ~8 FFT bins).
- Maintain a rolling average; flag a "beat" when current energy exceeds `1.3 × avg` with a short refractory period.
- Expose current `bass`, `mid`, `treble`, and `beat` to the per-style render functions.

### Subtle UI reactivity (in `src/pages/Index.tsx`)

Lift the analyser-derived bass level (already available via `analyser` state) into a lightweight `useAudioLevel` hook that returns a 0–1 value via rAF. Use it for two small touches, gated behind the existing visualizer toggle being non-"off" so users who disable effects get a calm UI:

- **Now-playing title glow**: animate `text-shadow` intensity of the current song title with the bass level (uses existing `--primary` color, no new colors).
- **Album/now-playing border pulse**: animate the `box-shadow` spread on the "Now Playing" panel border with the same level.

No new dependencies, no layout changes, no backend changes.

### Files to edit

- `src/components/Visualizer.tsx` — add 4 new styles + beat/energy helper, extend `VisualizerStyle` union.
- `src/pages/Index.tsx` — extend `VIZ_STYLES` list, add `useAudioLevel` hook, apply pulse to title + now-playing panel.
