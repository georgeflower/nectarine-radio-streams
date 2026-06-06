## Root cause

Two separate bugs cause the head/neck to detach from the body during waddling:

**1. GooseFamily adults & goslings** — The body image rotates around `center center` (the `bodyTilt` swing), but the head image only inherits the body's *translation* (`bodyTX + headTX`, `bodyTY + headTY`), not its rotation. So when the body tilts, the neck-pivot point on the body sweeps along an arc while the head stays in a horizontally-translated frame, opening a gap and tilting the neck the wrong way.

**2. FlyingGoose ground-waddle branch** — The head is mirrored independently via `scaleX(${lookScale})` while the body keeps its original orientation. Because the head sprite's `transformOrigin` is at the neck pivot (not the wrap center), `scaleX(-1)` shifts the head sideways relative to the body, producing the floating-head look in the video.

## Fix

### `src/components/GooseFamily.tsx` (adult render ~line 806–830 and gosling render ~line 750–770)

Nest the head inside a body-tilt wrapper so the head shares the body's rotation frame:

```text
<div wrap: translate3d(x,y) scaleX(dir)>
  <div bodyFrame: translate(bodyTX,bodyTY) rotate(bodyTilt), origin center center>
    <img body />
    <img head: translate(headTX, headTY) rotate(headTilt),
              origin = neck pivot (in body-frame coords) />
  </div>
</div>
```

This keeps the neck pivot welded to the body as the body sways, and the head's own bob/tilt stays a small offset on top of that. Apply to both the adult and gosling render blocks.

### `src/components/FlyingGoose.tsx` ground/waddle render (~line 794–797)

- Remove the `scaleX(${lookScale})` on `imgHead` while ground-waddling.
- Apply `lookScale` (clamped, smoothly tweened — already maintained) to the **wrap** transform instead, so the whole goose mirrors as a unit: `wrap.style.transform = translate3d(tx, ty+rock) scaleX(lookScale)`.
- Keep the head transform limited to the chew bob (`translate(0, chew) rotate(chew * CHEW_ROTATION_FACTOR)`), matching the existing perched ground rendering.
- Reset `wrap.style.transform` (drop the `scaleX`) on `takeoff()` and in the other non-ground branches that already set `wrap.style.transform` without it, so flying frames don't keep an old mirror applied.

## Out of scope

- No constant retuning (sway/bob amplitudes stay the same).
- No design-token, schema, or scheduler changes.
- `BoingBall.tsx`, `gooseSocial.ts`, `gooseBeat.ts` untouched.
