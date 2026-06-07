## Why adult geese look/behave different

Today there are two completely separate goose implementations:

- **Originals (`src/components/FlyingGoose.tsx`, ~1250 lines)** — full state machine: takeoff, fly, descend, land, perch on letters/windows, ground waddle, head bobs, stamina, tiredness, panic, smiley reactions, snack/sitting, incubation, mothering, ball-play chase. Renders flap frames 0–3 in flight and body+head split when grounded. Registers itself with `gooseSocial` via `registerGoose()`.
- **Grown-up offspring (`src/components/GooseFamily.tsx` "Family adults")** — its own tiny `ground | flying | descending` state machine (~150 lines), no perches, no stamina, no panic, no perch claims, no oneliner reactions. Renders body+head split with the waddle bob even while airborne (the recent fix swaps in flap frames but the underlying motion is still its mini-FSM, so it doesn't match the originals).

That divergence is the root cause. Layering more patches onto the family-adult FSM will never make it match. The right fix is to delete the parallel implementation and reuse `FlyingGoose` for adults too.

## Plan

### 1. Parameterize FlyingGoose so it can drive any adult

Extend `FlyingGoose` props:

```ts
type Props = {
  oneliners?: OnelinerEntry[];
  variant?: GooseVariant;             // sprite palette / behavior tag
  role?: "original" | "family";       // default "original"
  rosterId?: string;                  // for family adults
  colorFilter?: string;               // CSS filter used today in GooseFamily
                                       // (pink/lightgr/etc.) — applied to <img>
  startPos?: { x: number; y: number };
  startMode?: "fly" | "ground";
  isDying?: boolean;                  // drives the slumped pose + opacity
  onDeath?: () => void;               // fired after the death animation
};
```

Behavior gating when `role === "family"`:

- Do **not** participate in coordinator-driven flows that are reserved for the two originals: incubation/mothering, food-fetch, ball-play chase, away/fly-away. (`registerGoose` will accept a flag, see step 2.)
- Still uses the full flight/perch/waddle/stamina/panic logic — that's exactly what the user wants.
- Color is applied via the existing CSS `filter` approach already used in `GooseFamily` (the sprite palette stays `white`; filter shifts hue).
- When `isDying` toggles on, run the existing dying visual (lowered head, opacity/grayscale), then call `onDeath` after the mourning duration ends so GooseFamily can remove it from the roster.

### 2. Extend `gooseSocial.registerGoose` with a role tag

```ts
registerGoose(api, { role: "original" | "family" })
```

- `getPair()` only ever returns the white+brown **originals** (skip `family` entries) — preserves all current dialogue / incubation / ball-play targeting.
- The family entries are still tracked in `geese` so the perch-claim registry and collision constants apply uniformly (originals + family share perches the same way two originals do today).

### 3. Replace the adult render/tick in `GooseFamily.tsx`

Keep in `GooseFamily`:

- Spawning of new adults from grown-up goslings (roster promotion, name, color, sex).
- The adult cap (`MAX_TOTAL_ADULTS`), dying selection, mourning ritual orchestration.
- Eggs + goslings rendering and behavior (unchanged).

Replace:

- The `FamilyAdult` type, `adultsRef` tick loop (~lines 116–760), the per-adult collision pass against originals, and the flying/descending/ground state machine.
- Render adults as `<FlyingGoose role="family" rosterId={a.id} colorFilter={...} startPos={...} isDying={...} onDeath={...} />` (one component per adult). Mount via a keyed list so adding/removing adults at promotion/death just adds/removes children.

The post-hatch fly-in (the brief moment after a gosling is promoted) reuses `FlyingGoose`'s natural mount path: it starts in the air, descends, lands, perches, waddles — exactly like an original.

### 4. Debug overlay

`getFamilySnapshot()` already exposes adult state for the HUD. Replace its source: instead of reading from `adultsRef`, iterate `geese` filtered to `role === "family"` and pull mode/position via the existing `getPosition()` (plus a new `getMode()` on `GooseAPI`, also added for originals so the HUD's `mode: "?"` rows go away as a free side benefit).

### 5. Cleanup / out of scope

- `AdultMode`, `FamilyAdult`, collision-vs-originals loop, sitting flag for adults, mourning chatter tick → all moved/deleted along with the adult FSM.
- Eggs, goslings, mother behavior, ball, originals — untouched apart from `registerGoose` getting a role tag.

## Files

- `src/components/FlyingGoose.tsx` — add `role`, `rosterId`, `colorFilter`, `startPos`, `startMode`, `isDying`, `onDeath` props; expose `getMode()` on the API; gate coordinator-only flows when `role==="family"`.
- `src/lib/gooseSocial.ts` — `registerGoose(api, opts)`, `getPair()` filters to originals, add `getMode()` to `GooseAPI`.
- `src/components/GooseFamily.tsx` — drop the adult FSM and adult render block; render adults as `<FlyingGoose role="family" ... />`; keep promotion, capping, dying, mourning, eggs, goslings, mother orchestration.
- `src/components/GooseDebugOverlay.tsx` — source adult rows from the unified `geese` map; show real mode for originals too.
- `src/test/flyingGooseEggs.test.tsx`, `src/test/gooseSocial.test.ts` — update for the new `registerGoose` signature and the unified adult flow.
