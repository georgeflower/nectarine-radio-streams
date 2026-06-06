## 1. Reproduction scheduler tuning (`src/lib/gooseSocial.ts`)

Goal: second clutch should only fire after adults are truly back in idle "post-hatch" life, not immediately as the brood ends.

- Raise `REPRODUCTION_COOLDOWN_MS` from `12 * 60_000` → `18 * 60_000`.
- Increase the `goslings-grown` deferred window from `(10–15) min` → `(15–22) min` (sets `reproductionEarliestAt`).
- After `runReproductionPhase()` completes (line ~627), also push `reproductionEarliestAt = Date.now() + REPRODUCTION_COOLDOWN_MS` so the standalone trigger and the snack-coupled trigger share one clock.
- Add a hard "post-hatch settle" gate in the standalone reproduction branch in `step()` (line ~725): require all of
  - `reproductionEarliestAt > 0 && now >= reproductionEarliestAt`
  - `now - lastReproductionAt >= REPRODUCTION_COOLDOWN_MS`
  - `!familyHasLiveOffspring()`
  - `now - lastBroodEndAt >= POST_HATCH_SETTLE_MS` (new, 4 min)
  - `mood === "idle"` (already gated) AND no active snack break / fly-away
- Track `lastBroodEndAt` by listening for the existing `brood-end` event near line 138/160.
- Remove the snack-coupled reproduction call at line 692 (or guard it behind the same settle gate) so a clutch can no longer start mid-snack right after the previous brood ends.

## 2. FlyingGoose ground waddle (`src/components/FlyingGoose.tsx`)

Goal: white & brown originals occasionally land on the floor and waddle inside the bottom 20% band instead of always perching on letters/windows.

- Add a new behavior state alongside the existing perch cadence:
  - `nextGroundWaddleAt = rand(35_000, 80_000)` (initial), refreshed each cycle.
  - `groundWaddleUntil = 0`, `groundWaddleTargetX`.
- When `mode === "fly"` and idle conditions hold (`!away && !eatingMode && !fetchingFood && !ballPlayActive && !incubating && !restingFromTiredness`) and `elapsed >= nextGroundWaddleAt`, ~50% of the time choose ground-waddle instead of `pickPerch()`:
  - Set `targetY = rand(h * 0.80, h - spriteH() * 0.6 - 12)` (inside the existing floor band used by the family adults).
  - Pick `groundWaddleTargetX = rand(w * 0.1, w * 0.9)`; fly down to that point, then transition `mode = "ground"` with a new flag `waddlingOnGround = true` (mirrors the family adults' floor waddle).
  - While `waddlingOnGround`, sample a fresh `groundWaddleTargetX` every 2.5–5 s and walk toward it (slow horizontal lerp, body rock & head bob already in the `ground` branch). Duration `rand(12_000, 25_000)`.
  - When the timer expires, call `takeoff()` and set `nextGroundWaddleAt = elapsed + rand(45_000, 110_000)` and `nextPerchAt = elapsed + rand(6_000, 14_000)` so the goose alternates between waddling, perching, and free flight.
- Also lower the perch bias: when `elapsed >= nextPerchAt`, only attempt `pickPerch()` ~60% of the time; otherwise defer by `rand(5_000, 12_000)` so they don't immediately re-perch after every flight.
- All new behavior is suppressed by the existing override flags (`away`, `chaseTarget`, `fetchingFood`, `ballPlayActive`, `incubating`, `restingFromTiredness`) — same gating used for perching.

## Out of scope

No design-token changes, no schema changes, no edits to `GooseFamily.tsx`, `BoingBall.tsx`, or `gooseBeat.ts`.
