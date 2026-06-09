# Speed up the tunnel (and friends) on Firefox

## Root cause

`src/components/Visualizer.tsx` leans hard on `ctx.shadowBlur` for the neon glow effect. The tunnel scene is the worst case: per frame it sets a non-zero `shadowBlur` and calls `ctx.stroke()` around 70 times (≈35 wireframe segments + ≈35 ring outlines, each with 14 sides).

Firefox's Canvas2D path renders `shadowBlur` on the CPU and does it once per `stroke()` call — Chromium has a much faster GPU-accelerated path. This is the single biggest reason the tunnel drags in Firefox while feeling smooth in Chrome. Mobile dpr (currently capped at 2, but the device reports 2.625) multiplies the cost because the blur kernel scales with pixel count.

Other scenes (`bars`, `oscilloscope`, `rings`, `particles`) use the same pattern but with far fewer strokes per frame, so they only get noticeably slow on weaker machines.

## Plan

Make changes only in `src/components/Visualizer.tsx`. No behaviour or UI changes outside performance.

1. Detect Firefox once at mount (`navigator.userAgent.includes("Firefox")`) and expose a `glow` helper that returns the desired blur size or `0` on Firefox. Use it everywhere `shadowBlur` is assigned.
2. Lower the canvas dpr cap to `1.5` (from `2`) — Firefox's 2D backend gets a disproportionate win from fewer pixels, and the neon look hides the resolution drop. Keep Chromium behavior visually identical by gating the cap behind the Firefox check if we want to be conservative.
3. Tunnel-specific tweaks (`renderTunnel`):
   - Drop `slices` from 36 → 24 and `sides` from 14 → 10 on Firefox; keep current values elsewhere.
   - Skip the per-slice ring-outline pass for far slices earlier (raise the `fade <= 0.05` cutoff to `0.15` on Firefox).
   - Batch all wireframe segments that share a hue bucket into one `beginPath` / `stroke` so we issue ~6 strokes instead of ~35. Approximate the per-slice color by quantizing `a.hue` to 30° buckets.
   - When `glow === 0`, simulate the neon look by drawing each ring twice: once thick + low-alpha, once thin + bright. Much cheaper than `shadowBlur` and visually close.
4. Apply the same Firefox-gated `shadowBlur` swap to the other render functions (`renderBars`, `renderOscilloscope`, `renderRings`, `renderParticles`) so the whole visualizer benefits — these are one-line changes.
5. Sanity-check with the browser tool after the change: open the preview, switch to the tunnel style, and confirm the frame rate climbs (`browser--performance_profile`).

## Files touched

- `src/components/Visualizer.tsx` (only).

## Out of scope

- No changes to audio analysis, scene selection UI, or other components.
- No new dependencies.
