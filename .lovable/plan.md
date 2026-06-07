## Goals

1. Goslings that grow up should actually take off and fly (currently they keep waddling because the new adult is spawned in `ground` mode with no immediate takeoff).
2. Eliminate the residual oscillation when two geese bump — make `PERSONAL_SPACE_PX`, the post-bump cool-down, and the separation distance tunable in one place and tune the defaults.
3. Add a developer debug overlay that exposes per-goose state, perch claims, collision vectors, and all life-cycle timers/counters with their governing rules.

All changes stay in existing files plus one new debug overlay component. No backend, no new dependencies.

## 1. Goslings grow up → enter flight (`GooseFamily.tsx`)

When a gosling crosses `GROW_UP_MS` and is promoted to a `FamilyAdult`, set the initial mode to `flying` rather than `ground`:

- New adult spawn fields: `mode = "flying"`, `y = upper-air band`, `targetX/targetY` picked in the upper band (same logic the original FlyingGoose uses on first appearance), `takeoffAt = undefined` (will be set when it lands).
- Add a one-shot guard: if a promoted adult is still `mode === "ground"` within 250ms of `bornAt`, force `mode = "flying"` (covers any persisted/restored case).
- When the new flying adult reaches its airborne target → run the existing `approach` → `descending` → `ground` chain. On `ground` entry, set `takeoffAt = now + sitDuration()` so the standard cycle continues.

No other lifecycle behavior changes.

## 2. Tunable collision avoidance (`GooseFamily.tsx`, `FlyingGoose.tsx`, `gooseSocial.ts`)

Centralize the magic numbers in a single exported constants object in `gooseSocial.ts`:

```ts
export const GOOSE_COLLISION = {
  personalSpacePx: 34,      // up from 28 — clears beak/tail overlap
  separationPushPx: 18,     // half-overlap minimum push per frame
  bumpCooldownMs: 650,      // up from 400 — kills oscillation
  retargetJitterPx: [80, 160] as const, // new target offset range after bump
  perchPersonalSpacePx: 36, // perch-anchor exclusion radius
};
```

All ground/waddle code (`GooseFamily.tsx` adults + goslings, `FlyingGoose.tsx` originals) and `pickPerchCandidate` read from this constant instead of local literals.

Tuning rules added on top of the existing pairwise loop:

- After a bump, set `a.avoidUntil = now + bumpCooldownMs` and `a.avoidPartnerId = partner.id`. While `now < avoidUntil`, the avoider may not pick a new target whose sign toward `avoidPartnerId` is toward the partner — re-roll the target sign instead.
- Replace symmetric push with asymmetric push: only the body with the larger `|targetX - x|` (i.e. the more "committed" mover) gets re-targeted; the other only gets a position nudge. This prevents the both-flip-each-frame oscillation seen in earlier builds.
- Add a hysteresis band: separation logic only triggers when `dist < personalSpacePx`; clearing only happens once `dist > personalSpacePx + 6`. Inside the band, no second bump fires.

## 3. Debug overlay (new `src/components/GooseDebugOverlay.tsx`, mounted in `Cracktro.tsx`)

A toggleable, fixed-position panel (top-right, monospace, semi-transparent dark surface) shown only when a debug flag is on. Toggle via:

- Keyboard: `Shift+D` while in Cracktro.
- URL: `?gooseDebug=1`.
- Persists in `localStorage` under `cracktro-goose-debug`.

The overlay subscribes (via a new `subscribeGooseDebug` event on `gooseSocial.ts` + a polling `requestAnimationFrame` for live position data) and renders three sections:

### 3a. Per-goose table
Columns: `id`, `kind` (original/family-adult/gosling), `color/variant`, `mode` (ground/flying/descending/approach/land), `x,y`, `dir`, `targetX,Y`, `perchClaim` (key or `—`), `avoidUntil` (ms remaining), `avoidPartner`.

### 3b. Collision vectors
For every active pair within `personalSpacePx * 1.5`, render a row `A ↔ B  dist=NN  push=±N  cooldown=Nms`. Also overlay thin colored lines between the live sprite positions on screen (absolute-positioned 1px lines, only when debug is on) so overlap is visually obvious.

### 3c. Life-cycle timers & counters

For every event with a timer/counter, show:
- Current value
- Rule that governs it (constant name + value), e.g. `GROW_UP_MS = 8 min`
- Last event timestamp + elapsed since
- Next scheduled time (if applicable)

Entries to include:

| Group | Counter / Timer | Rule |
|---|---|---|
| Eggs | live eggs count, last egg laid at, next hatch in | `MAX_LIVE_EGGS=4`, hatch window 18–32s |
| Goslings | count, oldest age, time until next grow-up | `GROW_UP_MS=8min`, `MAX_GOSLINGS=8` |
| Adults | family adult count, total (incl. originals), oldest `diesAt` countdown | `MAX_TOTAL_ADULTS=8`, `ADULT_LIFE_BEFORE_DEATH_MS=5min` |
| Mourning | rituals run (session counter), currently active y/n, time remaining | `MOURNING_DURATION_MS=45s` |
| Deaths | total deaths this session, last death at | n/a |
| Reproduction | last reproduction at, cooldown remaining | `lastReproductionAt` from `gooseLife` |
| Snack break / fly-away | last run at, next eligible at | from `gooseSocial` cooldowns |
| Ball play | last run at, cooldown remaining | `getBallPlayCooldownMs` |
| Perches | claims list `(gooseId → perchKey @ anchorX)` | `perchPersonalSpacePx=36` |
| Collisions | bumps this session, currently in cool-down list | `bumpCooldownMs=650` |

Counters that have never fired show `0` / `—` rather than being hidden — every counter is always present.

To support this, add small session counters and getters to `gooseSocial.ts`:
- `recordDeath()`, `recordMourning()`, `recordBump()` plus `getDebugCounters()` returning the structured snapshot above.
- `GooseFamily.tsx` calls these at the existing points (death scheduling, mourning start, collision resolution).

The overlay is purely additive — when the flag is off, nothing renders and there is zero runtime cost beyond a single `localStorage.getItem` check.

## Technical notes

- Files touched: `src/lib/gooseSocial.ts`, `src/lib/gooseBehavior.ts` (read constant from gooseSocial), `src/components/GooseFamily.tsx`, `src/components/FlyingGoose.tsx`, `src/components/Cracktro.tsx` (mount overlay + key handler), new `src/components/GooseDebugOverlay.tsx`.
- Tests: extend `gooseSocial.test.ts` with `recordBump`/`getDebugCounters` round-trip; extend `gooseBehavior.test.ts` to assert `pickPerchCandidate` reads `perchPersonalSpacePx` from the new constant.
- No design-token or styling changes outside the debug overlay (which uses existing tokens).
- No persistence schema changes; new adult `mode` and `avoidUntil` remain runtime-only.
