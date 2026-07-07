## Reorganize Cracktro settings bar

Restructure the settings row in `src/components/Cracktro.tsx` (lines ~1297–1393).

### Rapture mode section (renamed from "Geese")
- Section label: **Rapture Mode**
- New master toggle **Rapture Mode: ON/OFF** at the front. When toggled:
  - OFF → forces `gooseOn=false`, `brownGooseOn=false`, `procreationOn=false` (remembers prior states)
  - ON → restores prior states (default all ON on first activation)
- Keep individual toggles: **Goose**, **Brown**, **Procreation** (disabled/greyed while Rapture Mode is OFF).
- Move the **Goose Stats** button here — this is the current `roster` panel toggle (relabel from "Geese" to "Goose Stats") from the PANELS list.
- Keep **Reset Family** button.
- Remove **Boing** from this section.

### More section
- Keep Last.fm + version button.
- Add **Boing: ON/OFF** toggle (moved from Geese).
- Add **Diag** toggle (moved from Panels — the `diag` PANELS entry that opens PlaybackDiagnostics).

### Panels section
- Remove `roster` (moved to Rapture) and `diag` (moved to More) from the PANELS array or filter them out of the Panels render loop.
- Keep Info Bar and remaining panels (oneliner, users, upnext, history).

### Persistence
- Add a new `localStorage` key `cracktro-rapture-mode` for the master toggle (default ON to preserve current behavior).
- Existing keys for goose/brown/boing/procreation remain untouched.

### Out of scope
- No change to the `GooseDebugOverlay` (Shift+D dev HUD) — that's a separate dev overlay, not the "Geese" panel.
- No visualizer/theme changes.
