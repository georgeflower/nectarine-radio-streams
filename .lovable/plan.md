## Problem

In scroller mode, clicking "♪ Reactivity…" opens the Sheet, but the Sheet portals to `document.body` via Radix's default. When the Cracktro is in browser fullscreen, only the fullscreen element (`wrapRef`) is visible, so the drawer renders off-screen / behind the fullscreen surface and appears not to open. Even in windowed scroller mode, z-index/backdrop-filter stacking under the cracktro chrome can hide it.

## Fix

Portal the Sheet into the Cracktro container so it renders inside whatever surface is visible (fullscreen element or the in-page window), showing the same full reactivity control set as the main player.

### Changes

1. **`src/components/ui/sheet.tsx`**
   - Add `container?: HTMLElement | null` to `SheetContentProps`.
   - Pass it to `<SheetPortal container={container}>`. Radix accepts `container` on `Portal`; omitted → defaults to `document.body` (existing behavior for main player).

2. **`src/components/ReactivityDrawer.tsx`**
   - Add optional `container?: HTMLElement | null` prop on `ReactivityDrawer`.
   - Forward to `<SheetContent container={container} …>`.

3. **`src/components/Cracktro.tsx`**
   - Compute a portal target: `document.fullscreenElement as HTMLElement | null ?? wrapRef.current`.
   - Track it in state, refreshed by the existing `fullscreenchange` listener, so it updates when the user toggles fullscreen while the drawer is closed.
   - Pass it to the `<ReactivityDrawer container={portalTarget}>` in the Effect row.

4. **Version + changelog**
   - Bump `package.json` to `0.7.7`.
   - `ChangelogModal.tsx`: `APP_VERSION = "0.7.7"` and new entry: "Reactivity drawer now opens correctly from scroller mode in both windowed and fullscreen, showing the full per-mode control set."

### Files touched

- `src/components/ui/sheet.tsx`
- `src/components/ReactivityDrawer.tsx`
- `src/components/Cracktro.tsx`
- `package.json`, `src/components/ChangelogModal.tsx`
