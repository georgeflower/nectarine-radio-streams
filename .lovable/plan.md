# Goose family + cracktro polish

A big batch of related changes to the goose ecosystem, chat, and player. Grouped into 7 areas; each is independently shippable but all share the same `GooseFamily` / `gooseSocial` / `FlyingGoose` surface.

## 1. Reproduction lifecycle (egg → sit → hatch → follow)

Currently eggs spawn at the adults' position the moment a snack starts, and goslings are independent the moment they hatch. New flow:

1. **Snack ends** for the female (white goose) → she flies down to the floor, drops 1–3 eggs at a fixed floor Y, then stays there.
2. **Incubation**: while eggs exist, the mother *sits on* the eggs (sit/peck idle, anchored to egg cluster). She emits incubation lines: "Almost there, little ones…", "Come on, hatch!", "I can feel them wiggling!", etc.
3. **Father role**: while mother is incubating OR while goslings exist, the male (brown) periodically "fetches food" — flies to a snack spot, returns to mother, triggers a brief feed bubble ("Here, my love" / "Open wide!"). Reuses existing snack mechanic, retargeted to mother.
4. **Hatch** (existing 18–32s window): goslings spawn at the egg position.
5. **Following**: goslings target the mother's x (offset by index) with a small follow distance, and may roam up to **20% of screen height above the floor** (currently floor-locked).
6. Father continues to fetch food for mother + goslings while any gosling is young.

Implementation: extend `gooseSocial` event bus with `incubation-start/stop` and `feed-delivery`; `FlyingGoose` consumes them to schedule the mother's "sit on eggs" anchor and the father's fetch trips. `GooseFamily` owns eggs + goslings.

## 2. Goslings grow up, color variety, and 8-adult cap

- Goslings age via wall-clock (~3–5 min of presence) → promote to an **adult** entry stored in `GooseFamily`'s state.
- Random adult color from: **pink, yellow, light green, Amiga light blue (#5cc8ff), brown, white, black**. Implemented as CSS `filter` / tinted overlay on existing sprite frames in `gooseSprite.ts`.
- Adults waddle on floor, occasionally play with the ball, speak phrases.
- **Population cap: 8 total adults** (including the 2 originals). When a 9th would be promoted, hold the gosling as a juvenile until a slot opens.
- **Aging-out / mourning ritual** when cap is reached:
  - Mark the **two oldest** adults for death **5 minutes** later.
  - At death, trigger a **mourning ritual** (elephant-style): all remaining geese gather around the fallen pair, slow waddle in a loose circle, heads dipped.
  - During the ritual (~45 s): the scroller text and other text overlays **darken and fade** (CSS opacity + desaturate transition); normal chatter is replaced with a separate **mourning phrase pool**: "We honor you, friend.", "Fly on, dear one.", "The flock remembers.", "Silent wings.", "Goodbye, gentle goose.", etc. Pure dialogue lines — no real elephant audio.
  - After the ritual, the two are removed, scrollers fade back, normal chatter resumes, and held juveniles can promote into the freed slots.

## 3. Named roster + info overlay

- Every goose (originals + every gosling + every grown family member) gets a **funny computer/nerd name**. Pool of ~40 names: Ada, Bytey, Klompy, Amiga, Kickstart, Workbench, Guru, Meditation, Pixel, Sprite, Modem, Floppy, Turbo, BBS, ANSI, Demoscene, Nybble, Bitmap, Cracktro, Goto10, Segfault, Null, Void, Heap, Stack, Cache, Cookie, Pingu, Trasher, Octocat, Vimmy, Emacs, Sudo, Kernel, Daemon, Lambda, Tux, Clippy, Bonzi. Unique per session; reroll on collision.
- Each goose has **sex** (m/f), **birth date** (wall-clock), **color**.
- New **roster overlay window** (reuse `FloatingWindow`) toggled from the menu: table of Name · Age · Color swatch · Sex.
- Live age recompute from `bornAt`.

## 4. Song-rating chatter

When the now-playing track changes, geese speak a phrase based on rating tier. ≥6 phrases per tier:

- **≥4.0**: "Great song!", "High score!", "What a banger!", "Crank it!", "This slaps!", "Add to favs!".
- **3.0–3.99**: "Nice tune by {artist}", "Decent track from {artist}", "{artist} cooking", "Pretty good!", "I'd replay this", "Solid 3-star vibe".
- **2.0–2.99**: "So low score, why?", "I think I like this… or do I?", "Not my favorite", "Mid, honestly", "Skip-adjacent", "{artist}, you can do better".
- **<2.0**: "OMG, low score!", "My ears are bleeding", "My taste differs — I kinda like it!", "Who approved this?", "Send help", "Cursed BPM".

`gooseDialogues.ts` gets `getSongRatingLine(rating, artist)`; cooldown so only one or two geese chime in per track.

## 5. Bubble clamping (always on-screen)

Current bubble is `left:50%; top:-22` relative to goose; overflows near edges. Fix in both `FlyingGoose` and `GooseFamily`:

- Measure bubble via ref + `getBoundingClientRect` after mount.
- Clamp so `bubbleLeft + width/2 ≤ stageWidth - 8` and `≥ 8`; clamp `top ≥ 4` (flip below the goose if no headroom).

## 6. Gosling right-corner stuck bug + ball collisions

- **Stuck goslings**: clamp `targetX` to `[40, w-40]` when re-targeting; if `|targetX - x| < 14` and we just clamped, force a new target on the *opposite* side.
- **Ball collision = ball radius**: in `BoingBall.tsx` drop the `gooseCollisionPadding` when geese are **not** in play mode. Instead of an authored bump, **deflect** off the goose: normal from goose to ball, reflect `vx,vy` along that normal with current bounce factor, apply small separation push. Apply same to goslings (smaller contact radius scaled by gosling size).

## 7. Player UI: song time + cracktro size control

- **Info window**: add `mm:ss / mm:ss` showing elapsed and total for the current track, sourced from `AudioPlayer`.
- **Cracktro menu size control**: port the size selector from the non-cracktro player (e.g. S/M/L), persisted to localStorage. The size control **resizes the floating windows and the info box** (not the full stage). Apply via a width/scale prop on `FloatingWindow` instances.

## 8. Persistence + reset

- **Persist grown-up family adults** across reloads in localStorage (`cracktro-goose-roster-v1`): id, name, sex, color, bornAt, x snapshot. Eggs already persist. Goslings persist similarly so a refresh mid-hatch resumes.
- **Settings reset button**: add a "Reset goose family" button to the cracktro settings menu. Shows a confirmation dialog ("This will permanently delete all your geese, eggs, and goslings. The two original geese will return. Continue?"). On confirm: clear `cracktro-goose-roster-v1`, `cracktro-goose-eggs-v2`, and any related keys, then reload the family overlay.

## Technical notes

- New files: `src/lib/gooseFamilyRoster.ts` (name pool + assignment + persistence), `src/lib/gooseColorPalette.ts` (color presets + tint helper), `src/components/RosterWindow.tsx`, `src/lib/gooseMourning.ts` (ritual state machine + phrase pool).
- Sprite tinting at the DOM level via `filter: hue-rotate / saturate` or a `mix-blend-mode: multiply` tinted overlay clipped to sprite alpha.
- Event bus additions in `gooseSocial.ts`: `incubation-start`, `incubation-stop`, `feed-delivery`, `roster-changed`, `mourning-start`, `mourning-end`.
- Scroller fade: add a `mourningActive` context flag read by scroller/text overlays to apply `opacity-50 saturate-50 transition` during the ritual.
- Tests: extend `flyingGooseEggs.test.tsx` ("mother flies down + drops eggs"); add `gooseDialogues.test.ts` (rating tier selection); bubble-clamp unit test; mourning state-machine test (cap → mark oldest two → 5 min → ritual → removal).
