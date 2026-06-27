## Changes

### 1. Rename the launch button on the main page
`src/pages/Index.tsx` (~line 428-435):
- Button label `▶ Fullscreen` → `▶ Scroller Mode`
- `title` attr → `"Open cracktro scroller mode in a window"`
- No behaviour change on click (still opens `<Cracktro>`).

### 2. Default to windowed cracktro, not auto-fullscreen
`src/components/Cracktro.tsx`:
- Remove the auto `requestFullscreen()` call in the mount effect (~lines 364–397). Keep the `fullscreenchange` listener and the cleanup that exits fullscreen on unmount.
- `isFullscreen` initial state stays `false`, so the scene loads in windowed/in-page mode by default.
- Keep the existing fullscreen toggle button (~line 1186–1208) untouched so the user can still enter fullscreen from windowed mode, and exit back to windowed mode. Its dynamic label (`Window mode ⤓` / `Enter ⤢`) already covers both directions.

### 3. Allow up to 200% pinch-zoom on mobile
`index.html` line 5 — update the viewport meta:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=2, user-scalable=yes, viewport-fit=cover" />
```

This lets mobile users pinch-zoom up to 2× while keeping the initial layout at 100%.

## Out of scope
- No changes to the in-cracktro window-size selector (S/M/L) or `cracktroUi.ts`.
- No version bump / changelog edits unless you ask.
