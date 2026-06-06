## 1. Goslings not turning into geese

`GROW_UP_MS` is currently 3 min, but the user wants 8 min for goslings to become adults.

Fix:
- Change `GROW_UP_MS` from `3 * 60_000` to `8 * 60_000` in `src/components/GooseFamily.tsx`.
- `gooseFamilyRoster.ts`: add `isPlaceholderName(name)` helper (matches `"Gosling"`, empty, or whitespace-only names).
- `GooseFamily.tsx` `loadGoslings()`: when backfilling legacy goslings, assign a real unique name via `pickUniqueName(takenSet)` instead of `"Gosling"`, and update the matching roster entry name.
- Promotion block (~line 393): if the existing roster name is placeholder or missing, assign a unique name so the promoted adult gets a real identity.
- Mount effect (~line 208): sweep roster — any `kind: "gosling"` whose `wallNow - bornAt > GROW_UP_MS` with no matching live gosling in `goslingsRef` gets promoted to `kind: "adult"` (real name + adult color) and pushed into `adultsRef`. Also rename any `kind: "adult"` entries still called `"Gosling"`.

## 2. Neck wobble pivots from the body

Both gosling head (line 672) and family-adult head (line 729) use `transformOrigin: "center center"`, so the head rotates around its midpoint and appears to detach from the body. `FlyingGoose.tsx` already uses the sprite-grid neck base at `(11.5, 10)` in `PIXEL` units (`NECK_PIVOT_X_PX`, `NECK_PIVOT_Y_PX`).

Fix in `GooseFamily.tsx`:
- Import `NECK_PIVOT_X_PX` and `NECK_PIVOT_Y_PX` from `@/lib/gooseSprite`.
- Gosling head `img`: `transformOrigin: \`${NECK_PIVOT_X_PX * sceneScale * GOSLING_SCALE_FACTOR}px ${NECK_PIVOT_Y_PX * sceneScale * GOSLING_SCALE_FACTOR}px\``.
- Family-adult head `img`: `transformOrigin: \`${NECK_PIVOT_X_PX * sceneScale}px ${NECK_PIVOT_Y_PX * sceneScale}px\``.
- Leave the outer wrapper and body `transformOrigin` unchanged (wrapper still handles `scaleX(dir)` mirroring).

## 3. Promoted adults join the full social life

`FamilyAdult` instances are rendered by `GooseFamily` but never registered with `gooseSocial`, so they cannot play ball, fly away, or participate in dialogue.

Fix:
- Expose public `registerGoose(api: GooseAPI)` / `unregisterGoose(api: GooseAPI)` from `gooseSocial.ts` (currently exists only in the `__testing` block).
- Build a lightweight adapter for each `FamilyAdult` that implements the full `GooseAPI` interface, mapping social directives to local adult state (new fields: `away`, `chaseTarget`, `ballPlayActive`).
- Register each promoted adult immediately upon creation.
- Tick loop in `GooseFamily` honors `away` (hide sprite), `chaseTarget` (move toward ball target), `ballPlayActive` (pause normal activity rotation).
- Ball-play (`runBallPlay`) picks any two registered geese, not only `white`/`brown`.
- Dialogue scheduling includes family adults via their registered `say` method.
- Family adults use `variant: "family"` so dialogue pools work.

## 4. All adults roam the floor band

All adult geese (originals + family adults) should sometimes walk on the floor between the very bottom and 20% up from the bottom.

Fix:
- When the activity is `waddle` or `socialise`, set `targetY` in the range `[h * 0.8, floorY]` (bottom 20% of screen).
- For originals (white/brown), this means overriding their normal perch-target logic when the floor-roam activity is active. `gooseSocial.ts` sets `grounded: true` on the goose during this window.
- For family adults, the same `targetY` sampling applies natively in `GooseFamily`.

## 5. Ball parks on a far-away shelf during brood

While the mother is incubating eggs or caring for goslings, the ball cannot be played with.

Fix in `BoingBall.tsx`:
- Listen for family events `incubation-start` and `brood-end`.
- On `incubation-start`:
  - Render a small pixel-art shelf near the right top at 20% down (`x = w * 0.78`, `y = h * 0.20`). Animate it sliding in from the right.
  - Animate the ball from its current position to the shelf anchor while scaling from `1` to `0.15` (1200 ms, ease-in-out). This creates the visual of the ball going farther away and shrinking.
  - Disable ball physics and block `gooseSocial` ball-play via a new `setBallAvailable(false)` gate.
- On `brood-end` (all goslings promoted to adults, no eggs left):
  - Reverse the ball animation: scale `0.15` to `1` and translate back to a stage-center landing point (800 ms ease-out), then resume physics.
  - Animate the shelf retracting out to the right (500 ms ease-in).
  - Re-enable `setBallAvailable(true)`.
- `gooseSocial.ts`: add `setBallAvailable(boolean)` guard and skip `runBallPlay` while false.

## Files touched
- `src/components/GooseFamily.tsx` — `GROW_UP_MS`, placeholder-name backfill, stuck-gosling rescue, neck pivot `transformOrigin`, register family adults with social, floor-roam band.
- `src/lib/gooseFamilyRoster.ts` — `isPlaceholderName` helper.
- `src/lib/gooseSocial.ts` — public `registerGoose`/`unregisterGoose`/`setBallAvailable`, pick any two registered geese for ball-play, emit `brood-end`.
- `src/components/BoingBall.tsx` — shelf overlay, park/return animations, physics gate.
- `src/components/FlyingGoose.tsx` — `grounded` support for floor-roam, neck pivot reuse.
- `src/test/gooseSocial.test.ts` — small test for `setBallAvailable` blocking ball-play.

No design-token, schema, or backend changes.
