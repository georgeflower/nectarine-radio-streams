## Firefox Performance Warnings

Add two dismissible Firefox performance warnings — one on the main page and one inside the cracktro scroller.

### 1. Main page banner (`src/pages/Index.tsx`)
- Show a red dismissible text banner at the top of the page when the user is on Firefox.
- Message: "Known performance issues with Firefox for the effects. For best performance change to Chrome, Edge or Safari."
- Dismissal persists in `localStorage` so it does not reappear after the user closes it.
- Reuse the existing `usePersistedBool` pattern or a small localStorage-backed `useState` for the dismiss flag.
- Style with Tailwind: red text (`text-red-500` / `text-red-400`), close button (`✕`), compact single-line banner above the `<header>`.

### 2. Cracktro scroller text (`src/components/Cracktro.tsx`)
- Append a Firefox warning segment to the existing `text` useMemo string.
- Only include it when `/Firefox/i.test(navigator.userAgent)`.
- Message: "   ***   KNOWN FIREFOX PERFORMANCE ISSUES — FOR BEST EXPERIENCE USE CHROME, EDGE OR SAFARI   ***   "
- This way the warning scrolls through naturally with the rest of the scroller text.

### Technical notes
- Firefox detection: `typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent)` (same pattern already used in `Visualizer.tsx`).
- No new dependencies.
- No changes to other components or hooks.