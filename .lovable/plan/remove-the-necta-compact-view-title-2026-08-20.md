# Remove the "Necta Compact View" title

## Goal
Remove the large `h1` "▌Necta Compact View" title from the header and keep the smaller descriptive text underneath it.

## Change
In `src/pages/Index.tsx`, update the `<header>` block so the smaller `<p>` text remains but the large `<h1>` title is removed.

### Current markup
```text
<div>
  <h1 className="text-2xl md:text-3xl font-bold neon tracking-widest uppercase">▌Necta Compact View</h1>
  <p className="text-muted-foreground text-[10px] uppercase tracking-[0.25em] mt-1">
    Compact player for Nectarine, the demoscene radio.
  </p>
</div>
```

### Proposed markup
```text
<div>
  <p className="text-muted-foreground text-[10px] uppercase tracking-[0.25em] mt-1">
    Compact player for Nectarine, the demoscene radio.
  </p>
</div>
```

No other files are affected.

## Verification
- Typecheck with `bunx tsc --noEmit`.
- Run `bunx vitest run`.
- Visually confirm in the preview that the header no longer shows the large title but still shows the smaller description.
