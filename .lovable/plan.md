
The user wants to swap the visual order of the two columns on desktop (md+) so the **Oneliner / Online / Streams** panel appears on the LEFT and **Currently Playing / Queue / History** appears on the RIGHT. On mobile (single column), the order must stay as-is: Currently Playing first, then Oneliner.

Current structure in `src/pages/Index.tsx`:
- A `<section className="grid gap-4 md:grid-cols-2">` contains two `<article className="panel">` children, in DOM order: (1) Now Playing/Queue/History, (2) Oneliner/Online/Streams.

Wait — the user says "keep streaming above oneliner" on single column. "Streaming" here likely refers to the Currently Playing / playback section (top of page) which is already above everything via the `AudioPlayer`. But within the grid, on mobile they want the Now Playing panel to remain above the Oneliner panel. So mobile order is unchanged.

### Plan

Use Tailwind's `order` utilities to swap columns only at `md+`:
- Now Playing article: add `md:order-2`
- Oneliner article: add `md:order-1`

This keeps DOM/mobile order intact (Now Playing first, Oneliner second) while flipping the visual order on desktop so Oneliner is on the left.

### File to change
- `src/pages/Index.tsx` — add `md:order-2` to the first `<article className="panel">` and `md:order-1` to the second one.

### Acceptance
- Desktop (≥768px): Oneliner/Online/Streams column on left, Now Playing/Queue/History on right.
- Mobile (<768px): Now Playing panel appears first, Oneliner panel below it (unchanged).
