# Add Amiga Boing Ball (togglable, fullscreen)

Add the classic Amiga "Boing" ball as a togglable overlay, mirroring the existing FlyingGoose toggle pattern.

## What to build

A new `src/components/BoingBall.tsx` component that renders a fullscreen-covering, pointer-events-none overlay drawing the iconic red/white checkered sphere bouncing across the screen — built entirely in code (no images), inspired by `niklasekstrom/boing_ball_python`.

### Visual
- Checkered sphere: red (#e30b5c-ish) and white tiles, 8 latitude bands × 16 longitude segments.
- Sphere rotates continuously around a tilted axis (≈ 23° lean), exposing checker pattern wrapping.
- Soft drop shadow ellipse on the "floor".
- Subtle purple grid background **not** added (we keep overlay transparent so Cracktro visuals show through). Just ball + shadow.

### Motion
- Ball bounces horizontally wall-to-wall and vertically with gravity, squashing slightly on floor impact.
- Frame-rate independent using delta-time (same pattern as Visualizer starfield fix).
- Spin direction flips on each wall hit (matches original demo).

### Rendering
- `<canvas>` fixed inset-0, `pointer-events-none`, `z-index` above visualizer but below UI controls (match FlyingGoose layering).
- Resize listener for window size.
- Sphere drawn by projecting a UV-checker-textured sphere: iterate lat/long grid, compute 3D point, rotate by ball orientation matrix, project orthographically, fill quad with red or white based on (lat+long) parity. Back-face cull via normal.z.

## Integration (`src/components/Cracktro.tsx`)

Mirror the goose toggle exactly:
1. Import `BoingBall`.
2. Add `boingOn` state with `localStorage` key `cracktro-boing` (default off).
3. Render `{boingOn && <BoingBall />}` next to `{gooseOn && <FlyingGoose />}`.
4. Add a "Boing" ON/OFF pill button in the same control row as the Goose toggle, only visible in fullscreen mode (same conditional as goose).

## Technical notes
- No new deps.
- All colors via inline canvas fills (canvas pixels aren't subject to the design token rule).
- Cleanup RAF + resize listener on unmount.

## Files
- create `src/components/BoingBall.tsx`
- edit `src/components/Cracktro.tsx` (import, state, render, toggle button)
