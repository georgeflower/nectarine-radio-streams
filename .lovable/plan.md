# Fix top-corner buttons hidden behind iOS status bar

## Problem
On iPhone Safari (and PWA standalone) the system status bar / Dynamic Island overlays the top of the page, sitting on top of the Cracktro "Exit", scene-era badge, fullscreen toggle, and the centered settings bar. They become unreachable.

`index.html` already declares `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style=black-translucent`, so the page extends under the status bar — we just need to push the chrome down by `env(safe-area-inset-top)` (and respect left/right insets for the side buttons too).

## Change

Single file: `src/components/Cracktro.tsx`.

For each absolutely-positioned top-edge control, replace the static `top-2` / `top-4` with an inline style that adds the safe-area inset, and add a small min offset so it still has breathing room when the inset is 0:

```tsx
style={{
  top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
  left: "calc(env(safe-area-inset-left, 0px) + 0.5rem)",
}}
```

Apply to:

1. **Exit Cracktro button** (line ~893) — `top-2 left-2` → safe-area top + left.
2. **Scene-era badge** (line ~903) — `top-2 left-20` → safe-area top, `left: calc(env(safe-area-inset-left,0px) + 5rem)`.
3. **FPS counter** (line ~914) — `top-2 right-24` → safe-area top + right (5.5rem offset to clear fullscreen button).
4. **Centered settings bar** (line ~925) — `top-2 left-1/2` → only top needs the inset; keep the `-translate-x-1/2` via `transform`.
5. **Enter/Exit fullscreen button** (line ~1180) — `top-4 right-4` → safe-area top + right.

Tailwind class `top-2` / `top-4` / `left-*` / `right-*` is removed from those elements and replaced by the inline `style` so the calc wins (avoids Tailwind class specificity issues).

## Out of scope

- No change to bottom-edge UI (the screenshot shows the issue is only at the top, but if needed later, `env(safe-area-inset-bottom)` would apply the same way).
- No viewport meta or PWA manifest changes (already correct).
- No version bump / changelog update (the user asked only for the fix; I'll mention bumping it once they approve).

## Verification

- `cracktroDefaults.test.tsx` already exercises the Exit and fullscreen buttons by role — keep passing since `aria-label`/visibility classes are untouched.
- Manual check on iPhone Safari: in fullscreen, Exit and fullscreen-toggle should sit below the time and Dynamic Island.
