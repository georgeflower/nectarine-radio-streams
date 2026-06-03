## Fullscreen scroller polish

**File:** `src/components/Cracktro.tsx`

1. **Remove top label** — delete the "A Qumran Cracktro · Nectarine Demoscene Radio" `<p>` block at the top.
2. **Trim scroller text** — remove `"   *** GREETINGS FROM QUMRAN ***   "` prefix; keep "NOW SPINNING…ESC TO RETURN…" content.
3. **Faster scroll** — bump `offset += 3 * dpr` to `~6 * dpr` per frame.
4. **Bigger wave** — increase amplitude from `h * 0.22` to `~h * 0.38` and grow canvas height (160 → 220) so the larger sine doesn't clip.
5. **Travelling feel (not just up/down)** — phase the sine on time as well as position so the wave moves rightward through the letters: `y = cy + Math.sin(x * 0.014 - t * 2.2) * amp`. Tune frequency so adjacent glyphs sit at visibly different heights (avoids the "block bobbing" look). Optionally add a slight per-character rotation tied to the local slope for extra motion cue.
6. **Wait for full exit before repeating** — change the draw loop: instead of `x = w - (offset % totalW)` (which wraps and immediately re-enters from the right), use a non-wrapping `x = w - offset` and only reset `offset = 0` once `w - offset + totalW < 0` (i.e. the last glyph has passed the left edge). Render a single pass of `chars` rather than `chars.length * 2`.

No other files change.
