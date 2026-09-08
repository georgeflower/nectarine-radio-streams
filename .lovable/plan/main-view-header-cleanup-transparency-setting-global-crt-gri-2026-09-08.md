# Main view: header cleanup, transparency setting, global CRT grille

## 1. Remove the tagline, centre the buttons

In `src/pages/Index.tsx` the header currently has a left text block ("Compact player for Nectarine, the demoscene radio.") and a right-aligned control row.

- Delete the text block entirely.
- Turn the header into a single centred row: theme picker, text-size stepper, Scroller Mode, Settings — spread evenly across the full width and centred (`flex-wrap justify-center` with even gaps; on wide screens the group is centred as one row).
- Keep every control, its behaviour and its 44px touch target unchanged.

## 2. Transparency setting for panels and buttons

- New persisted setting `nectarine-ui-opacity` (default = current look), added to the ⚙ Settings popover as a slider labelled "Transparency" with a few steps (e.g. 40%–100%).
- The value is written to a CSS variable `--ui-alpha` on the document root.
- `.panel` in `src/index.css` and the header/settings button backgrounds switch from fixed `bg-card/60`-style alphas to `hsl(var(--card) / var(--ui-alpha))`, so panels and buttons in the main view fade together.
- Text, borders and glows stay fully opaque so readability is unaffected. Scroller mode is untouched.

## 3. Global CRT (juN3bula style) option

Today the fine scanline + aperture-grille overlay is hardcoded to `[data-theme="junebula"]`.

- Add a second persisted toggle in Settings: "CRT grille: On/Off" (default Off), alongside the existing Scanlines toggle.
- Set `data-crt="grille"` on the root when it is on, and change the CSS selector so the overlay applies to either `[data-theme="junebula"]` or `html[data-crt="grille"]` — same visuals, any theme.
- juN3bula keeps forcing its own CRT on regardless of the toggles, as now.

## Technical notes

Files: `src/pages/Index.tsx`, `src/index.css`. No backend, no changes to the scroller, visualizers, or audio. Verify with `bunx tsc --noEmit` and `bunx vitest run`, plus a browser check of the header layout at both phone and desktop widths.
