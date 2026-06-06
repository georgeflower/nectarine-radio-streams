## Problem

Grown-gosling family adults in `GooseFamily.tsx` use a lightweight activity rotation (waddle / sit / socialise / play / fly). Two flaws make them look buggy compared to the original white/brown geese:

1. **Direction flicker while flying** — during `activity === "fly"`, `a.dir = a.targetX > a.x ? 1 : -1` is recomputed every frame. As they approach the target X the sign flips back and forth, so the goose visibly flips left/right in mid-air.
2. **Teleport-drop after flying** — when the fly window (`activityUntil`) ends, the next rolled activity (e.g. `sit`, `play`, or `waddle`) immediately clamps `a.y` to `adultFloorY`. The goose snaps from the upper half of the screen straight down into the bottom waddle band.

The originals (`FlyingGoose.tsx`) avoid both because they use an explicit `takeoff() → fly → approach → land` state machine instead of a free activity roll.

## Plan

Only touch the grown-adult update loop in `src/components/GooseFamily.tsx` (the block starting ~line 524). No other systems change.

1. **Stabilize fly direction**
   - Track and persist `a.dir` once at fly start (from sign of `targetX - x`).
   - Only re-evaluate `a.dir` when `|targetX - x| > ~30px` so small overshoots don't flip the sprite.
   - When the goose reaches its fly target before `activityUntil`, pick a new airborne target in the same upper band instead of stalling/flipping.

2. **Add a "returning" landing phase instead of teleport-drop**
   - When `activity === "fly"` and `wallNow >= a.activityUntil`, do not immediately roll a new activity. Switch the adult into an internal `descending` state: keep flying horizontally but drive `targetY` down to `adultFloorY` at the existing fly speed.
   - Only after `a.y` reaches the floor band (within a few px of `adultFloorY`) is a new ground activity rolled (waddle / sit / socialise / play). This mirrors how `FlyingGoose` requires an explicit land before ground behavior.

3. **Tighten the "fly" trigger so it feels intentional, not glitchy**
   - Keep the same ~12% probability but ensure the fly target X is at least ~120px away so the goose actually traverses, instead of bouncing in place.
   - Cap fly duration so it can't end while the goose is still near apex with no clear descent path (covered by step 2, but worth ensuring `activityUntil` is long enough for a full out-and-back arc).

4. **No changes** to: gosling logic, reproduction scheduler, mourning ritual, chatter, food/ball, originals (`FlyingGoose`), or any styling/transforms (the prior neck-socket fix stays as-is).

## Technical notes

- Adult state lives in `adultsRef.current` (`FamilyAdult`). Add an optional `descending?: boolean` flag (or reuse `activity === "fly"` plus a `landingFromFly` boolean) — no roster/persistence changes needed since these are runtime-only.
- Floor check: `Math.abs(a.y - adultFloorY) < 2` is sufficient before clearing the descending flag and calling the activity-roll branch.
- Direction-flip guard: store last non-trivial sign; only update when horizontal delta exceeds threshold.
