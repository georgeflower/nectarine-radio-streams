## Goal
Replace `public/favicon.ico`'s current orange/amber palette with the CRT theme palette already used in the app, keeping the same icon shape/design.

## CRT palette (from `src/index.css` `:root`)
- Background: very dark warm black `hsl(20 25% 6%)` ≈ `#13100C`
- Primary (amber glow): `hsl(28 100% 60%)` ≈ `#FF8A33`
- Foreground (soft amber): `hsl(35 95% 70%)` ≈ `#FBC68A`
- Accent (magenta): `hsl(320 90% 65%)` ≈ `#F255C2`

Wait — the existing favicon already uses the orange/amber family which IS the CRT theme. Re-reading the request: the user wants to move AWAY from orange. So the new palette should drop amber/orange and lean on the non-orange CRT tokens: deep warm-black background + amber-cream foreground + magenta accent (no bright orange). Final palette:
- Background: `#13100C` (deep CRT black)
- Main strokes/glyph: `#FBC68A` (CRT foreground cream)
- Accent highlight: `#F255C2` (CRT accent magenta)
- Optional subtle glow ring: `#7A4A2A` (muted border)

## Steps
1. Generate a recolored 512×512 PNG from the current `public/apple-touch-icon.png` (same artwork as favicon, higher res) using `imagegen--edit_image` with a prompt that:
   - preserves the existing shapes/letters/composition exactly
   - swaps orange/amber fills for the CRT cream `#FBC68A`
   - adds magenta `#F255C2` as a small accent
   - keeps deep warm-black `#13100C` background
   - no new elements, no text changes
2. Use the generated PNG to overwrite `public/favicon.ico` (multi-size ICO: 16, 32, 48) using a sandbox command (`magick` via nix imagemagick) so browsers continue to receive a real `.ico`.
3. Leave all other icons (apple-touch-icon, icon-192, icon-512, manifest) untouched per user's choice.
4. Verify by viewing the new favicon file size and a quick preview screenshot of the browser tab is out of scope; rely on file replacement.

## Files touched
- `public/favicon.ico` (replaced)

No code, manifest, or HTML changes.