## Animated Pixel Goose for Fullscreen Mode

Add a lifelike flying goose, drawn entirely in code (no image asset), as a toggleable overlay in fullscreen mode.

### 1. New component: `src/components/FlyingGoose.tsx`

A self-contained full-viewport overlay (`fixed inset-0 pointer-events-none z-[60]`) containing a single goose that wanders the screen.

**Goose rendering (code-built, pixel-art style inspired by the reference sprite):**
- Render via inline SVG with `shape-rendering: crispEdges` using small rectangles to mimic the pixel sprite (white body, black outline, orange beak + feet, light-grey wing underside).
- 4 wing-pose frames defined as pixel arrays: wings-up, mid-down, wings-down, mid-up. Cycle frames ~8 fps for a natural flap.
- Goose drawn facing right by default; horizontal facing handled via `transform: scaleX(-1)` when flying leftward so the head always leads.
- Rotate the sprite slightly (≈ velocity angle clamped to ±25°) so it banks/pitches into its direction — head stays first.

**Lifelike movement (requestAnimationFrame loop):**
- Position (x, y) and velocity (vx, vy) in component refs.
- A slowly drifting target heading (Perlin-ish: accumulate small random angle deltas every ~400–900 ms) plus gentle sinusoidal bobbing on the perpendicular axis for a flapping glide feel.
- Soft speed variation (occasional glide vs. flap-burst — flap frame rate ties to current speed).
- Edge handling: when nearing viewport bounds, steer the heading back inward (smooth turn, not teleport) so direction changes look intentional.
- Occasional "banking turn" events that pick a new target heading 60–140° away.

### 2. Toggle in fullscreen controls (`src/pages/Index.tsx`)

- Add `GOOSE_STORAGE_KEY` and a `usePersistedBool` `goose` state (default `false`).
- Add a toggle button in the fullscreen controls bar (next to scanlines toggle) with a 🪿 / "Goose" label and `aria-pressed`.
- Render `<FlyingGoose />` only when `isFullscreen && goose`.

### Technical notes

- No new deps; pure React + SVG + rAF.
- Cleanup rAF and resize listener on unmount/toggle-off.
- Respects `prefers-reduced-motion`: if set, goose drifts more slowly and skips frame cycling.
- Pointer-events disabled so it never intercepts clicks on floating windows.

### Files

- create `src/components/FlyingGoose.tsx`
- edit `src/pages/Index.tsx` (state + toggle button + conditional render)
