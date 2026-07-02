# What's New Popup on Version Update

Add an auto-triggered "New Version" announcement that appears once per release, styled in the demoscene/cracktro aesthetic, and dismissible with per-version persistence.

## Behavior

- On app mount, compare `APP_VERSION` (from `ChangelogModal.tsx`) against `localStorage["changelog-seen-version"]`.
- If they differ (or key is missing), show a new `WhatsNewPopup` overlay.
- On close, write the current `APP_VERSION` into `localStorage["changelog-seen-version"]` so it won't reappear until the next bump.
- First-ever visitors also see it once (so they're introduced to the changelog) — acceptable and matches the spec.
- A "View full changelog" button inside the popup opens the existing `ChangelogModal` and marks the version seen.

## New component: `src/components/WhatsNewPopup.tsx`

Demoscene-flavored, standalone from `ChangelogModal`:

- Fixed overlay, centered, with backdrop blur + subtle scanlines.
- Card sized `max-w-md` on desktop, full-width with margin on mobile; max-height `85vh` with internal scroll for the changes list.
- Content shows only the **latest** entry from `CHANGELOG[0]` (version, date, bullet list) plus a headline like `NEW RELEASE // v{APP_VERSION}`.
- Two buttons: `[ DISMISS ]` and `[ FULL CHANGELOG ]`.
- Close via ✕, Escape, backdrop click, or Dismiss — all persist the seen version.

### Demoscene styling & animation

Reuse existing tokens (`neon-accent`, `bg-background`, `border-border`) — no hardcoded colors. Effects:

- Entrance: scale-in + fade-in, plus a chromatic-aberration glitch flash (2–3 quick RGB-split frames) using CSS keyframes.
- Animated neon gradient border (conic-gradient rotation) around the card.
- Subtle CRT scanline overlay inside the card (repeating-linear-gradient).
- Marquee "★ NEW VERSION ★ NEW VERSION ★" strip across the header, scrolling horizontally.
- Pulsing glow on the version number.
- Bullet items stagger-fade in (CSS animation-delay per index).
- Respect `prefers-reduced-motion`: disable glitch/marquee, keep fade only.

All keyframes added inline to the component via a `<style>` tag or added to `tailwind.config.ts` `keyframes` block (prefer tailwind config for `glitch`, `marquee`, `border-spin`).

## Wiring: `src/pages/Index.tsx`

- Add `const [whatsNewOpen, setWhatsNewOpen] = useState(false)`.
- In a `useEffect` on mount, read `localStorage.getItem("changelog-seen-version")`; if `!== APP_VERSION`, set `whatsNewOpen(true)`.
- Render `{whatsNewOpen && <WhatsNewPopup onClose={...} onViewFull={...} />}` at the same level as the existing `ChangelogModal`.
- `onClose` writes localStorage and closes.
- `onViewFull` writes localStorage, closes popup, opens `setChangelogOpen(true)`.

Cracktro mode (`Cracktro.tsx`) already renders inside `Index.tsx`, so mounting the popup at the `Index.tsx` level covers both modes. Confirm by ensuring the popup uses `z-[10001]` so it sits above cracktro chrome and its own changelog modal (which is `z-[10000]`).

## Responsive check

- Mobile: `w-[calc(100%-1.5rem)] mx-3`, larger tap targets (min 44px), buttons stack vertically under `sm`.
- Desktop: horizontal button row, `max-w-md`.

## Files touched

- **New**: `src/components/WhatsNewPopup.tsx`
- **Edit**: `src/pages/Index.tsx` (mount + effect)
- **Edit**: `tailwind.config.ts` (add `glitch`, `marquee`, `border-spin` keyframes/animations)

No backend, no version bump — this ships as part of the current v0.6.9 (the very first release with the feature will itself trigger the popup for existing users, which is the desired behavior).
