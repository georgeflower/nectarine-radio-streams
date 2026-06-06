## Goal

Drop the dual-scenario split (FlyingGoose vs. GooseLifeSimulation). Keep the **non-sim** (`FlyingGoose`) as the only goose runtime — it already owns speech, ball-play, food fetch, oneliner reactions and tired rest. Port the missing visual + life pieces from the sim: the polished **waddle / sit / rest** ground animations, **gosling** sprites, and an **egg → hatch** flow that actually produces goslings.

## Scope

### 1. Remove the sim toggle

- `src/components/Cracktro.tsx`
  - Delete the `gooseLifeSimOn` state, both storage keys (`STORAGE_GOOSE_LIFE_SIM`, `STORAGE_GOOSE_LIFE_SIM_MIGRATED`) and the migration effect.
  - Remove the `<GooseLifeSimulation>` branch in the render; always render the two `<FlyingGoose>` instances gated by `gooseOn` / `brownGooseOn`.
  - Remove the "Life Sim" control button and the `disabled`/opacity logic it added to the white/brown goose buttons.
- `src/components/GooseLifeSimulation.tsx`: delete the file.
- `src/test/cracktroDefaults.test.tsx`: drop assertions about the sim toggle / default-on behavior, keep tests for the remaining goose toggles.
- Leave `src/lib/gooseLife/*` in place for now (engine, types, sprite helpers) since FlyingGoose will reuse `gooseSprite` frames and small helpers for the new waddle/gosling work.

### 2. Port waddle / sit / rest animation polish into `FlyingGoose`

`FlyingGoose.tsx` already has "sitting for meal" and "resting from tiredness" states but they don't use the sim's body-sway / head-bob / sleeping head tilt. Lift the constants and the per-frame math from `GooseLifeSimulation.tsx` (the `WADDLE_*`, `PECK_*`, `SLEEP_HEAD_*`, `PLAY_BOUNCE_*` blocks plus the `walkStrideX/Y`, `walkHeadNudgeX/Y`, `headTransform` computation) into a small shared helper module:

- New `src/lib/gooseLife/groundAnimation.ts` exporting `computeGroundTransform({ phase, mode, spriteScale })` returning `{ bodyTranslate, headTransform, bounce }`.
- Use it in `FlyingGoose` whenever the goose is grounded (`sittingForMeal`, `restingFromTiredness`, or the new gosling waddle) so the sprite gets the same sway/bob/peck/sleep head tilt the sim showed.
- Refactor `GooseLifeSimulation`'s inline math into the same helper before deleting the file, to make sure visual parity is preserved (sanity check while editing; the file is then removed in step 1).

### 3. Add goslings to `FlyingGoose`

- Extend `GooseRole` (in `gooseSocial.ts`) and `FlyingGoose`'s `variant` prop to include `"gosling-white" | "gosling-brown"` — the sprite layer already knows these variants (`buildGooseFrameDataUrls("gosling-white"|"gosling-brown")`).
- Add an internal `goslings` array inside `FlyingGoose` (the parent goose owns them). Each gosling has `{ id, variant, x, y, vx, vy, followIndex }` and follows the parent's position with the same `FOLLOW_SPACING` logic from `gooseEngine.ts` (`followGoslingBehavior`). Render them in the same root container, scaled down via `GOSLING_SCALE_FACTOR` (lift the constant from the sim).
- Goslings don't get bubbles, ball-play, food bags, or oneliner reactions — they only waddle/follow and occasionally do the idle peck animation from the ground-animation helper.

### 4. Egg laying + hatching that actually works

Eggs currently exist only inside the sim engine and use 4 in-engine "hours" — which in the sim's accelerated clock never reach the cracktro lifetime. Replace with a lightweight, wall-clock flow inside `FlyingGoose`:

- When the white + brown geese are both present and "sitting" together (after a snack break) there is a small chance per snack break to enter a "nesting" beat: white goose says a nesting line and lays `1–3` eggs.
- Store eggs in component state: `{ id, x, y, laidAt, hatchAt }` where `hatchAt = laidAt + rand(45_000, 90_000)` ms (45–90 s real time — tuned so users actually see hatching during a typical session). Persist to `localStorage` keyed by date so eggs survive minor reloads.
- Render eggs as small sprites near the parent's resting position (simple oval CSS shape or an existing sprite frame — TBD during implementation, prefer reusing the sim's egg visual if present; otherwise a styled `div` with the goose palette).
- On every animation frame, check `Date.now() >= hatchAt`; if so, remove the egg and spawn a gosling in the `goslings` array (alternating `gosling-white` / `gosling-brown`). Trigger a short "Peep! 🐣" speech bubble from the parent.

### 5. Tests

- Update `src/test/cracktroDefaults.test.tsx` for the removed toggle.
- Add a unit test in `src/test/` that drives `FlyingGoose`'s egg logic with a mocked clock to confirm `hatchAt` produces a gosling and the egg is cleared.

## Out of scope

- The full sim social model (relationships, mourning, funerals, reproduction cooldowns). Only egg→hatch and goslings move over.
- Persistence of goslings across sessions (they live for the session only).
- Any backend changes.

## Files touched

- edit: `src/components/Cracktro.tsx`, `src/components/FlyingGoose.tsx`, `src/lib/gooseSocial.ts`, `src/test/cracktroDefaults.test.tsx`
- new: `src/lib/gooseLife/groundAnimation.ts`, `src/test/flyingGooseEggs.test.tsx`
- delete: `src/components/GooseLifeSimulation.tsx`
