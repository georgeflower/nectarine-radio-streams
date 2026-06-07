## Problem 1 — Grown-up adults use the wrong sprite when flying

Grown-up offspring adults in `src/components/GooseFamily.tsx` always render the standing waddle sprite (frames `STAND_BODY`/`STAND_HEAD` = 5/6), even when their internal `mode` is `"flying"` or `"descending"`. The two original geese (rendered by `FlyingGoose.tsx`) correctly swap to the flight sprite cycle (frames 0–3). Result: a grown-up labelled `flying·play` in debug visibly bobs along with the walking animation instead of flapping like an original.

(The `mode: "?"` shown for originals in the debug HUD is just because `getGoosePositions()` only exposes `{x,y}` — cosmetic, not part of this fix.)

### Fix

In the "Family adults" render block of `src/components/GooseFamily.tsx`:

1. Detect flight state: `const flying = a.mode === "flying" || a.mode === "descending";`
2. When `flying`, render a single flight sprite instead of the body/head split:
   - Cycle through frames `0..3` derived from `a.phase` at a flap cadence comparable to `FlyingGoose` (~110 ms/frame): `const frameIdx = Math.floor(phase * FLAP_FREQ) & 3;`
   - Replace the walking sway with a subtle vertical flap bob (`sin(phase * 2π * FLAP_FREQ) * scale`).
   - Skip `bodyTilt` while flying.
3. When `!flying`, keep the existing body/head split waddle render exactly as today.
4. Keep the directional `scaleX(a.dir)` and color filter logic in both branches.

No state-machine or debug overlay changes — purely a render-time branch on `a.mode`.

## Problem 2 — Boing ball never returns to play

The Amiga boing ball is supposed to leave the shelf and zoom into play when the geese want to ball-play, then zoom back up to the shelf when the play session ends. Currently it stays parked on the shelf forever after the first brood (debug HUD: `last ball play 24m58s ago`, cooldown `0s` — eligible, but it never re-enters play).

### Investigation needed (read-only)

- `src/components/BoingBall.tsx` — current shelf/in-play state machine, what triggers `play` mode, what triggers return to shelf.
- `src/lib/gooseSocial.ts` — how ball-play is scheduled (`lastBallPlayAt`, `ballPlayCooldownMs`, any `wantsBallPlay`/event emission) and what gates it. Confirm whether the gate is being held permanently by a stale flag (e.g. brood active, goslings present, post-hatch settle, mothering mode).
- `src/components/GooseFamily.tsx` / `src/components/FlyingGoose.tsx` — any consumer that toggles the ball or that blocks ball-play while a brood/goslings exist.

### Fix (after investigation, scope to be confirmed)

1. In whichever module owns the "should ball-play start now?" decision, ensure the gate clears once goslings are grown / brood has ended and no eggs are live, so the cooldown alone governs re-entry.
2. `BoingBall.tsx`: on the ball-play start signal, animate from shelf → into play (zoom-in); on the end signal (or after the play window expires), animate back to the shelf (zoom-out). Both transitions must be re-entrant so the ball can cycle indefinitely.
3. Emit/consume a clear start/stop event pair (reuse the existing snack/play event bus rather than adding a new global) and stamp `lastBallPlayAt` only at play start (not at every re-render) so the debug timer reflects reality.
4. Verify in the debug HUD: after a play session, `last ball play` resets to `0s ago` and the next session fires once `cooldown` elapses, regardless of whether goslings or eggs exist.

## Files

- `src/components/GooseFamily.tsx` — branch adult render for flying vs waddling.
- `src/components/BoingBall.tsx` — shelf ↔ play state machine, re-entrant.
- `src/lib/gooseSocial.ts` — unblock ball-play scheduling after broods; ensure `lastBallPlayAt` is stamped on start.
- (Possibly) `src/components/FlyingGoose.tsx` — if it gates ball-play participation while mothering/parenting.
