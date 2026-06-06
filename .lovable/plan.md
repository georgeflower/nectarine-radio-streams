## Goals

1. Grown-up goslings (family adults) behave like the original white/brown FlyingGoose — including flight, ground-band waddle targeting, and re-takeoff timing.
2. The top-left button is mislabeled: it currently reads "Era: …" but is the Exit button. Restore a clear Exit control while keeping the era readout.
3. Geese (and goslings) must never occupy the same pixel space — on the ground, or while perched. On collision they should peel off in a different direction.

All changes stay in the existing files. No backend, no new data, no new dependencies.

## 1. Mirror white/brown goose rules for grown adults (`GooseFamily.tsx`)

Today the grown adults use a free activity-roll (waddle / sit / socialise / play / fly) and rarely actually fly because the descending phase keeps preempting it. Re-align with the original `FlyingGoose` state machine:

- **Replace the activity roll with a fly-cycle mirror:**
  - States per adult: `flying`, `approach`, `land`, `ground` (with sub-activities waddle / sit / socialise / play during `ground`). Add `mode` + `groundEntersAt` + `takeoffAt` fields to `FamilyAdult` (runtime only, no persistence change).
  - On spawn (gosling promoted to adult) the adult enters `flying` first (matches FlyingGoose first appearance), then descends via `approach` → `land` to the ground band, then runs ground activities.
- **Ground-band targeting:** during `ground`, `targetY` is always clamped to the same `adultFloorY` band the white/brown geese use; vertical motion is from waddle bob only, not from activity reroll.
- **Re-takeoff timing:** copy the FlyingGoose timing model — pick `takeoffAt = now + sitDuration()` when entering `ground`, where `sitDuration()` matches the original range used in `FlyingGoose.tsx` (~12–25s with the same jitter). When `now >= takeoffAt` call the equivalent of `takeoff()`: set `mode = "flying"`, pick a new `targetX/targetY` in the upper band using the same min-travel + clamp logic FlyingGoose uses.
- **Direction stability** (already in place) is kept: only flip `dir` when `|dxToTarget| > 30`.
- **Descending preempt fix:** remove the current short-circuit that converts the fly window's end into a forced descent before the goose has actually traversed. The new flow uses `approach`/`land` only when `takeoffAt` is finite and the goose has reached its airborne target, identical to FlyingGoose.
- **Result:** grown adults will actually take off again on a schedule, glide across, descend cleanly, walk on the floor band, and repeat — visually indistinguishable from the originals (modulo color).

No changes to: gosling-stage behavior, reproduction scheduler, mourning ritual, chatter, food/ball, originals (`FlyingGoose`), neck-socket transforms.

## 2. Exit vs Era button (`Cracktro.tsx`, ~line 796)

The single top-left button is wired to `onExit` but its label says `Era: {sceneEraConfig.label}`. Split it into the intended two controls:

- **Exit button (top-left):** label/text reads `EXIT`, keeps `aria-label="Exit Cracktro"`, keeps the existing onClick. Same styling/position.
- **Era readout:** render the `Era: {label}` chip next to it (immediately to the right, same vertical position, same chrome) only when `sceneErasOn`. It's a passive readout, not a button — `<div>` with same border/typography.
- The hidden `sr-only` era announcement stays as-is.

No other Cracktro behavior changes.

## 3. Collision avoidance — geese never overlap (`GooseFamily.tsx`, `FlyingGoose.tsx`)

Introduce a lightweight shared "no-overlap" rule used in two places: ground waddling and perch selection.

### 3a. Ground / waddle separation

- Define a `PERSONAL_SPACE_PX` (~28px at base scale, scaled by `sceneScale`).
- Each frame, for every grounded body (family adults, family goslings, and the originals when on the floor), check pairwise distance against `PERSONAL_SPACE_PX`. If two overlap:
  - Compute the horizontal vector between them; push each by half the overlap so they separate.
  - Flip the *target* X of the moving one (`a.targetX = a.x + sign(awayDir) * rand(60, 140)`) so the next step continues away rather than back into the partner — this is the "go in another direction on bump" behavior.
  - Apply a short cool-down (~400ms) before that adult can pick a new target that would re-cross the partner, so they don't oscillate.
- Implementation lives in `GooseFamily.tsx` (single pass over `adultsRef.current` + `goslingsRef.current`). The originals expose their floor position via the existing `GooseAPI.getPosition`; include them as read-only obstacles so family members steer around them. The originals themselves get the same avoidance check added inside `FlyingGoose.tsx`'s ground tick using positions from `gooseSocial`'s registered API list.

### 3b. Perch separation

- When picking a perch (`pickPerchCandidate` in `src/lib/gooseBehavior.ts`), accept an `occupied: Array<{ ref: T; offset: number }>` argument. Reject any candidate `(ref, offset)` whose anchor X is within `PERSONAL_SPACE_PX` of an already-occupied anchor on the same letter/window.
- Track currently-perched geese in a small shared registry in `gooseSocial.ts` (`registerPerch(id, perchKey, anchorX)` / `releasePerch(id)`); `FlyingGoose` calls these on land/takeoff. `pickPerchCandidate` consults the registry via a new optional parameter so callers don't have to thread state manually.
- If every perch candidate is occupied, fall back to a ground waddle target instead of stacking on the same letter.

## Technical notes

- Files touched: `src/components/Cracktro.tsx`, `src/components/GooseFamily.tsx`, `src/components/FlyingGoose.tsx`, `src/lib/gooseBehavior.ts`, `src/lib/gooseSocial.ts`.
- `FamilyAdult` gains optional runtime fields (`mode`, `takeoffAt`, `avoidUntil`); existing persisted shape is unchanged.
- Tests: existing `gooseSocial.test.ts` and `flyingGooseLayout.test.ts` should still pass; add a small unit test that `pickPerchCandidate` skips occupied anchors within `PERSONAL_SPACE_PX`.
- No styling/design-token changes.
