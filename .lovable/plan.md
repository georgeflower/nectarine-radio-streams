## 1. Originals + grown adults share the floor

In `src/components/FlyingGoose.tsx` (white + brown originals): add a periodic "land & waddle" mood (~every 60–120 s) where the goose flies down to the floor band (bottom 20 % of the stage), waddles for ~10–20 s, then takes off again. Reuse the existing perch/landing machinery, but pick a floor Y in `[h*0.8, floorY]` instead of a letter/window perch.

In `src/components/GooseFamily.tsx`: occasionally let promoted family adults take off and fly briefly (new activity `"fly"`, ~8–12 s) before re-landing in the floor band. Adds an `airborneY` target sampled in `[h*0.2, h*0.5]` so they visually leave the floor.

## 2. Neck still has gap

Body and head currently translate independently — when the body translates `(bodyTX, bodyTY)`, the head doesn't move with it, so a visible gap opens.

Fix in `GooseFamily.tsx` (both gosling and adult head `<img>` blocks): make the head transform inherit the body translate so they stay glued:

```text
transform: translate(bodyTX + headTX, bodyTY + headTY) rotate(headTilt)
transformOrigin: NECK_PIVOT_X * scale + bodyTX  (same for Y)
```

Also apply the same fix in `FlyingGoose.tsx` waddle branch where the original geese render head/body separately.

## 3. Slower, calmer chatter

In `src/lib/gooseSocial.ts`:
- Bump every `say(text, durationMs)` call by ~1000 ms (e.g. 2200 → 3200, 1800 → 2800, 900 → 1900).
- Increase inter-line waits in `runBallPlay`, `runFlyAway`, `runReproductionPhase`, `runDialogue` by ~1500 ms.
- Raise `DIALOGUE_COOLDOWN_MS` 70 s → 110 s and proportionally bump `DIALOGUE_COOLDOWN_BY_ERA`.
- Slow scheduler tick from 2500 ms → 4000 ms.
- Snack break (sitting + eating loop): increase `await wait(2400)` → `4500` and only emit a snack line every 2nd iteration. Same treatment for the lonely partner while waiting for the food run.

## 4. Second clutch of eggs

In `gooseSocial.ts`:
- After a successful `runReproductionPhase()`, set a fallback `reproductionEarliestAt = Date.now() + 12 * 60_000` so the next clutch is guaranteed eligible 12 min later even if the `goslings-grown` event was missed.
- Add a standalone scheduler hook: in `step()`, if `mood === "idle"`, `Date.now() >= reproductionEarliestAt`, and the family currently has 0 live goslings, allow `runReproductionPhase()` to start directly without requiring a snack break. Cooldown the path with `lastReproductionAt`.
- On boot, initialize `reproductionEarliestAt = 0` so first clutch still happens naturally.

## 5. Ball shelf polish

In `src/components/BoingBall.tsx`:
- `SHELF_SCALE`: 0.15 → 0.25.
- Hide the ball position from `setBallPos` (already done) AND clear `ballPlayDirective` so no goose will speak about the ball. In `gooseSocial.ts`, when `ballAvailable === false`, skip ball-related lines entirely in `buildContextualDialogue` (filter `BALL_CHATTER_TAGS` or check pre-emptively before scheduling `runBallPlay`/snack lines mentioning the ball).
- Filter `MOTHER_CARE_LINES` to remove "Mind the ball, babies!" while parked (or guard with `getBallAvailable()`).

## 6. Ball bounces to beat (4/4) while parked

- Add a tiny module `src/lib/gooseBeat.ts` with `setBpm(n)`, `getBpm()`, and a `subscribeBeat(cb)` pub/sub that fires a tick every quarter-note based on `performance.now()` and the current BPM (no audio coupling needed). Default 120 BPM until a real value is set.
- In `src/pages/Index.tsx`, where `useBpm` returns the live BPM, call `setBpm(bpmDebug.bpm)` whenever it changes.
- In `BoingBall.tsx` parked render block: compute `bounceY = -Math.abs(Math.sin(now * Math.PI / quarterMs)) * 6 * sceneScale` so the parked ball does a small 4/4 hop on the shelf in sync with the music. No effect in `live` mode.

## Technical notes (files touched)

- `src/components/GooseFamily.tsx` — adult `fly` activity, head-follows-body transform.
- `src/components/FlyingGoose.tsx` — periodic floor-land for originals; head-follows-body transform.
- `src/components/BoingBall.tsx` — shelf scale 0.25, BPM bounce, suppress ball-speak signal.
- `src/lib/gooseSocial.ts` — chatter pacing, fallback reproduction trigger, ball-line gating.
- `src/lib/gooseBeat.ts` (new) — BPM pub/sub.
- `src/pages/Index.tsx` — publish BPM into the new store.

No schema, backend, or design-token changes. Existing tests in `gooseSocial.test.ts` continue to pass; pacing constants are numeric only.
