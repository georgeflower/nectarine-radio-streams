# Plan: Fix sizing + reproduction choreography

Three targeted fixes based on the latest feedback. No other behavior changes.

## 1. Size control affects text only, not window dimensions

**Problem:** `FloatingWindow` currently multiplies `pos.w` by `scale` and sets `fontSize: ${scale}em`, which scales both the panel width and the text. Same applies to the info box in `Cracktro.tsx`.

**Change:**
- In `src/components/FloatingWindow.tsx`: remove `width: pos.w * scale` → keep `width: pos.w`. Keep `fontSize: ${scale}em` so only text scales. Drop `transformOrigin` (no longer needed).
- In `src/components/Cracktro.tsx` info box: stop scaling the box's width/padding from `windowScale`; only apply `fontSize: ${scale}em` (or equivalent) to the inner text wrapper. Leave the box's fixed/responsive width alone.
- S/M/L still maps to 0.8 / 1.0 / 1.25 via `WINDOW_SCALE_VALUES`.

## 2. Mother actually flies down, lays, and sits on the eggs

**Problem:** Eggs currently spawn instantly at `snack-end` at `floorY = h - 28` near wherever the mother happens to be perched, with no fly-down and no incubation pose. Hatch starts immediately on the 18–32 s timer, so father has no time to fetch.

**Change in `src/lib/gooseSocial.ts` (`runFlyAway`)**:
After the snack-eating loop and before `emitFamilyEvent({ type: "snack-end" })`:
1. Emit a new `snack-end` (eating finished) — but DO NOT lay eggs here.
2. Emit a new event `lay-eggs-request` with the mother's current position. GooseFamily handles this by:
   - Choosing a floor anchor near horizontal center of where mother is.
   - Telling mother (via a new `flyToFloor(x, y)` API on `GooseAPI`) to descend and land at that floor point. The white goose's `FlyingGoose` instance already supports `setSitting` — extend it (or use the existing perch logic) to accept a forced ground target.
3. After mother lands (`flyToFloor` resolves / a `mother-landed` event fires), GooseFamily lays the 1–3 eggs at her exact landed position and sets `motherIncubating = true`.
4. Mother stays sitting on the eggs with the existing peck/sit animation. Block the social scheduler from re-perching her until incubation ends. New flag in `gooseSocial`: `isIncubatingWhite` blocks ball-play / fly-away / dialogue cycles for white.
5. Father (brown) immediately enters a food-fetch loop: fly off, return with food bag, deliver near mother + eggs (existing `setFoodBag(true)` then `false`), say a `FEED_DELIVERY` line. Loop every ~25 s until all eggs hatch and goslings are full-grown OR until cap is reached. While running, brown is also blocked from ball-play / regular fly-away.

**Hatch window stays 18–32 s** (eggs.ts), but laying only happens *after* mother lands, so father has the full pre-hatch window to start fetching. Also bump hatch low end to give father a guaranteed first delivery: add a guard that the first hatch can only resolve after the first father feed-delivery completes (or after 25 s if delivery fails).

**Incubation chatter:** new pool `INCUBATION_LINES` (≥8 lines, "Almost there, little ones…", "Warming the brood :)") spoken by mother on a ~4 s cadence while incubating.

## 3. Mother actually parents the goslings

**Problem:** After hatch, mother resumes normal social routine immediately.

**Change in `GooseFamily.tsx` + `gooseSocial.ts`:**
- Keep `isIncubatingWhite` set to true for `MOTHER_BROOD_MS = 90_000` after the *last* gosling hatches. During this window:
  - Mother stays grounded (sitting flag = false but `setFetchingFood(false)` and `setSitting(true)` toggled per a slow waddle pattern). She waddles slowly along the floor and goslings already follow her via existing `parentAnchor` logic.
  - Mother speaks from a new `MOTHER_CARE_LINES` pool every ~5 s ("Stay close, peeps!", "Aren't you adorable :D", "Eat up, little ones").
  - Father continues fetch/deliver loop and now also "feeds" goslings (deliver animation toward gosling cluster centroid, line from `FATHER_FEED_LINES`).
- After `MOTHER_BROOD_MS` elapses *and* no live eggs remain, clear `isIncubatingWhite` and let the normal scheduler resume. Father exits his fetch loop on the same event.

## Technical notes

- New `gooseSocial` events: `lay-eggs-request`, `mother-landed`, `feed-delivery`, `brood-end`.
- New `GooseAPI` method: `flyToFloor(x: number, y: number): Promise<void> | void`. `FlyingGoose` resolves it by overriding its target until `y` reached, then sets sitting.
- New flags in `gooseSocial`: `isIncubatingWhite`, `isFatherProvisioning`. Scheduler `step()` skips ball-play / fly-away / dialogue for the locked role.
- Persistence: add `motherIncubatingUntil` and `fatherProvisioningUntil` to a small `cracktro-goose-family-state-v1` localStorage key so a reload mid-brood resumes correctly.
- Tests:
  - Extend `flyingGooseEggs.test.tsx`: assert eggs are only laid after `mother-landed` and that hatch waits ≥ first feed-delivery.
  - New unit test for the `isIncubatingWhite` lock blocking ball-play in `gooseSocial.test.ts`.
  - Floating-window text-only scaling test (DOM width unchanged when scale changes; computed font-size changes).

## Files touched
- `src/components/FloatingWindow.tsx` (sizing)
- `src/components/Cracktro.tsx` (info box sizing only)
- `src/components/FlyingGoose.tsx` (new `flyToFloor`, incubation/provisioning gates)
- `src/components/GooseFamily.tsx` (lay-after-land, brood window, mother care lines)
- `src/lib/gooseSocial.ts` (new events, locks, father provisioning loop, incubation lines)
- `src/lib/gooseLife/eggHatch.ts` (gate first hatch on first feed-delivery)
- `src/test/flyingGooseEggs.test.tsx` + new tests

No design-token, no backend, no schema changes.
