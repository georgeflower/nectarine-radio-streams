# Platform-themed scroller skins

Add an automatic scroller "skin" that overrides the glyph rendering style based on the currently playing song's platform. The existing scroller motion modes (sinus / bouncy / zoomer / wobble / copper / vector / infobar) stay untouched — the **skin** only changes how each glyph is *painted* (colors, fill pattern, font feel), not how it moves.

## Skins (from the reference images)

1. **Amiga skin** — gold/bronze letters on black with a diagonal hatched/striped fill and a darker outline. Classic Amiga cracktro chunky look. Trigger: `platformName` contains "amiga".
2. **Atari skin** — bold blocky letters split into horizontal color bands top→bottom: red / yellow / green / blue (the Atari rainbow logo palette). Trigger: `platformName` contains "atari".
3. **C64 skin** — chunky letters with horizontal red / yellow / green bands (no blue), slight pixel feel. Trigger: `platformName` contains "commodore 64" or "c64".
4. **XM / Fasttracker 2 skin** — white pixel-style font with a dark blue chrome/wave gradient overlay, evoking the FT2 logo. Trigger: `platformName` contains "xm" or the song title ends in `.xm`, or platform is "FastTracker"/"Extended Module".
5. **Default skin** — current neon HSL rainbow (unchanged), used when no platform match.

## How the skin is applied

In `src/components/Cracktro.tsx`'s scroller `tick()` loop, the per-glyph paint block (currently the `ctx.shadowColor` / `fillStyle` / `fillText` calls) is replaced with a `paintGlyph(ctx, char, x, y, w, h, dpr, t, skin)` dispatch that runs a skin-specific painter. Motion (`y`, `scale`, `rotation`, `skewY`) computed by the current `mode` switch is reused as-is.

Each skin painter draws the glyph using `clip()` on the glyph path so band/stripe fills are confined to the letter shape:

- **Amiga**: gold gradient (`#3a1e08 → #d4a13a → #fff1c2 → #b8741c`) + a repeating 45° dark stripe pattern multiplied on top, dark outline stroke.
- **Atari**: clip to glyph, fill 4 horizontal bands (red `#d8341c`, yellow `#f5c518`, green `#3aa84a`, blue `#1f5fd6`) across the glyph's vertical extent. Tiny gap between bands.
- **C64**: same as Atari but 3 bands (red `#c44a3a`, yellow `#e8c352`, green `#5aa86a`), no blue.
- **XM/FT2**: white base fill + dark-blue chrome gradient (`#0a1a3a → #2a6acc → #b8d0ff → #1a3a7a`) running vertically through the glyph, subtle horizontal scan-line shimmer (`t`-animated) to mimic the FT2 logo waves; use a chunky pixel-y font stack (`"VT323","Press Start 2P",monospace`) for these letters only.

The hue-cycle / shadow-glow paint is kept only for the **Default** skin.

## Platform detection

New helper `pickSkin(platformName, title): Skin` in `Cracktro.tsx`:

```text
lower = platformName.toLowerCase()
if "amiga" in lower            -> "amiga"
if "atari" in lower            -> "atari"
if "c64" in lower or "commodore 64" in lower -> "c64"
if "xm" in lower or "fasttracker" in lower or title endsWith ".xm" -> "xm"
otherwise                       -> "default"
```

The skin is recomputed (via `useMemo`) whenever `platform` or `title` changes, and added to the scroller `useEffect`'s deps so a track change immediately repaints in the new style.

## Out of scope

- No new user-facing toggle for skins — fully automatic from platform metadata.
- No changes to motion modes, controls bar, info-bar mode, beat detection, or visualizer.
- No image assets imported; all four skins are drawn procedurally on the existing 2D canvas.

## Files touched

- `src/components/Cracktro.tsx` — add `Skin` type, `pickSkin()`, four painter functions, swap the per-glyph paint block to dispatch by skin, extend scroller `useEffect` deps.
