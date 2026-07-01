## 1. Main page (`src/pages/Index.tsx`) — declutter header

Keep in the top bar (always visible):
- Theme selector
- A− / A+ text-size stepper
- ▶ Scroller Mode
- Refresh

Move into a new "⚙ Settings" popover button (using existing `Popover` from shadcn):
- Scanlines toggle
- Visualizer style dropdown
- Diagnostics toggle
- Last.fm button

The popover opens a compact vertical panel anchored under the button.

## 2. Stop the A−/A+ from resizing the header buttons

Problem: `fontScale` is applied to `document.documentElement.style.fontSize`, so every rem-based element (including header controls) grows.

Fix: apply the font-scale as a CSS variable on `<main>` only (or use an inline `style={{ fontSize: ... }}` on `<main>`), and remove the write to `document.documentElement`. The header lives above/outside the scaled wrapper and stays at the browser default 16px, so button sizes are fixed regardless of the text-size setting. Panels inside `<main>` continue to scale because they inherit font-size from `<main>`.

## 3. Cracktro settings — sectioned layout with dividers

Reorganise the expanded settings bar (`src/components/Cracktro.tsx`, lines 1256–1499) into three horizontal sections separated by vertical dividers (`<div class="w-px h-8 bg-border" />` or the shadcn `Separator` with `orientation="vertical"`). Each section has its own small sticky label.

Sections:

**Visuals** — Scroller (on/off + mode buttons), Font (skin select), Effect (viz picker), FPS toggle, Size (S/M/L).

**Geese** — Goose, Brown Goose, Boing, Procreation, Family Reset.

**Panels** — Info Bar toggle (moved here), Oneliner, Online, Up Next, Recent, Geese, Diag.

Trailing right cluster (outside the three groups, separated by a divider): Last.fm compact button + version chip.

Layout uses `flex flex-wrap items-start` with each section as a flex column: label on top, controls in a wrapping row. On narrow widths sections stack vertically and dividers become horizontal (`sm:w-px sm:h-auto h-px w-full`).

## 4. Remove Scene Eras

Delete from `Cracktro.tsx`:
- `STORAGE_SCENE_ERAS`, `STORAGE_SCENE_ERA_LISTEN_MS` constants
- `sceneErasOn` state + its persistence effect
- Listening-time tracker and `lastEraTickAtRef` effect (lines ~525–566)
- The Era badge JSX (~lines 888–902)
- The Scene Eras toggle in the settings bar (~lines 1389–1402)
- Imports of `getSceneEraConfig`, `getSceneEraFromListeningMs`, `setGooseSceneEra`

Replace uses:
- `sceneEraConfig.scrollerSpeed` → constant `1`
- `sceneEraConfig.infoBarOpacity` → constant `0.9`
- Auto-viz mapping based on era → remove; keep user-selected `style`
- Drop the `setGooseSceneEra` calls entirely

Leave `src/lib/gooseSceneEra.ts` and the `setGooseSceneEra` API in place (unused) so no cross-module churn; can be deleted later.

## 5. Verification

- Header buttons stay the same visual size when clicking A− / A+; only panel text changes.
- Settings popover opens/closes on click and does not overflow on mobile.
- Cracktro settings bar shows three clearly divided groups with the specified controls and no Scene Eras row.
- No console errors; existing tests still pass.
