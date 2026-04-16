

## Plan: Foldable sections + expand oneliner

Make Infamous OneLiner, Who's Online, and Recently Played collapsible (open by default), matching the existing Live Streams pattern. Add an "Expand" toggle on the OneLiner to show all messages instead of the scrollable 72-height window.

### Changes (`src/pages/Index.tsx`)

- Add state:
  - `onelinerOpen` (default `true`)
  - `onelinerExpanded` (default `false`)
  - `onlineOpen` (default `true`)
  - `historyOpen` (default `true`)
- Convert each section heading (`▶ Infamous OneLiner`, `▶ Who's Online?`, `▶ Recently Played`) into a button matching the existing Live Streams toggle style: `▼`/`▶` chevron, full-width, count badge on the right where useful (oneliner count, users count, history count).
- Wrap each section's body in `{xxxOpen && (...)}`.
- For the OneLiner body:
  - When `onelinerExpanded` is false: keep `max-h-72 overflow-y-auto` (current behavior).
  - When true: drop the max-height/scroll so all entries render inline.
  - Add a small "Expand" / "Collapse" text button next to the count in the header (or just below), toggling `onelinerExpanded`. Only show it when there are oneliners.

### Notes

- No changes to data fetching, parsing, or other components.
- Reuse the existing `panel-heading` button styling already used for Live Streams for visual consistency.
- All sections start expanded so the first-load view is unchanged.

