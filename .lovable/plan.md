## Goal

Add scripted goose exchanges for Amiga/Atari tracks, a periodic "Have you seen Rapture?" routine, and a reaction when user **Rapture** posts in the oneliner.

## Roles

- **1st goose** = `white` variant (from `getPair()`).
- **2nd goose** = `brown` variant.

## 1. Amiga / Atari track exchange

Trigger when `nowPlaying` changes and the entity-cache platform is Amiga or Atari (case-insensitive match on `platformName`, like the existing skin detection in `Cracktro.tsx:413`).

- Amiga track → white: `"AMIGAAAAAA!"`, then ~1.4 s later brown: `"ATARIIIII!"`.
- Atari track → brown: `"ATARIIIII!"`, then ~1.4 s later white: `"AMIGAAAAAA!"`.
- Skip-every-second rule: track the last platform that fired this exchange. If the same platform fires twice in a row, swallow the 2nd; the 3rd fires again. Counter resets when the other platform plays.
- Fires once per track (dedupe on `title|artist|platform`, similar to existing `lastChatterKeyRef` in `Cracktro.tsx:319`).
- Runs in parallel with the existing rating chatter (offset its delay so they don't collide).

## 2. Periodic "Have you seen Rapture?" routine

Every **10 minutes** while both geese are registered (`getPair()` non-null), play:

1. white: `"Have you seen Rapture?"`
2. ~1.6 s later brown: `"No :("`
3. ~1.6 s later white: `"keep looking!"`

Scheduled via a `setInterval` started on first goose registration and cleared when pair is empty. Skip a cycle if the Rapture-oneliner reaction (below) fired within the last 2 minutes, to avoid collision.

## 3. Rapture oneliner reaction

Hook into the existing oneliner ingestion (`noteRecentOneliner` path used by `FlyingGoose.tsx:195`). When `username` matches `/^rapture$/i`:

- white: `"Rapture! <3"`
- brown (≈0.8 s later): `"Daddy!"`
- white (≈0.8 s later): `"Mommy!"`
- Start a 60-minute cooldown. Further Rapture oneliners during the cooldown do nothing.

The 10-minute routine in section 2 is suppressed for the same 60-minute window so the geese don't immediately ask "Have you seen Rapture?" right after he spoke.

## Files to change

- **New** `src/lib/gooseRaptureEvents.ts` — owns the platform-exchange state machine, the 10-min interval, the Rapture-oneliner cooldown, and a small helper `notePlatformChange(platform)` plus `noteRaptureOnelinerIfMatch(username)`. Uses `getPair()` / `sayFromAnyGoose`-style speaker selection by re-exporting tiny helpers from `gooseSocial.ts` or by adding `sayFromVariant(variant, text, durationMs)` to `gooseSocial.ts`.
- **Edit** `src/lib/gooseSocial.ts` — export `sayFromVariant(variant: GooseRole, text, durationMs)` (thin wrapper over `getPair()`); call `startRaptureRoutine()` from `registerGoose` and `stopRaptureRoutineIfEmpty()` from the unregister path (mirrors `ensureScheduler` / `stopSchedulerIfEmpty`). Inside `noteRecentOneliner`, call `noteRaptureOnelinerIfMatch(username)`.
- **Edit** `src/components/Cracktro.tsx` — in the existing now-playing effect (around line 319), also call `notePlatformChange(platform, { title, artist })` so the Amiga/Atari exchange runs once per track.

## Tests

Add `src/test/gooseRaptureEvents.test.ts` with fake timers:

- Amiga track → white then brown lines in order.
- Two Amiga tracks in a row → 2nd is skipped; 3rd fires again.
- Atari after Amiga resets the per-platform skip counter.
- 10-min interval emits the 3-line "Rapture?" exchange.
- Rapture oneliner triggers the 3-line scream and suppresses the next 10-min cycle and subsequent Rapture oneliners for 60 min.

## Out of scope

- No UI changes, no visualizer changes, no changes to existing rating chatter wording.
- No persistence across reloads for the cooldowns (in-memory like the rest of `gooseSocial`).
