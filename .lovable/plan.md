## Add more themes inspired by Nectarine/Demovibes

The app currently has 3 themes: **Blue blue** (workbench), **CRT** (legacy), **B & W** (gem). I'll add 6 more themes styled after ones from the scenestream.net demovibes gallery, wired through the same `[data-theme="..."]` mechanism already in `src/index.css` and the `THEMES` list in `src/pages/Index.tsx`.

### New themes

| ID | Label | Inspiration | Palette direction |
|---|---|---|---|
| `goatgray` | Goat Gray | goatgray | Neutral graphite panels, muted cyan accent |
| `pony` | Pony | pony | Pink/magenta on dark violet, playful |
| `orange` | Splash of Orange | Splash of Orange | Warm amber/orange accents on charcoal |
| `nostalgia-c` | Nostalgia-C | Nostalgia-C | Cream/paper background, brown text, retro-doc feel |
| `original` | Original | original theme (raina) | Classic Nectarine dark blue + lime accent |
| `simple` | Simple | Nectarine - Simple | Minimal light theme, low chrome |

### Changes

1. **`src/index.css`** — add a `[data-theme="..."]` block for each new theme, overriding the semantic tokens already used by workbench/gem (background, foreground, panel, panel-heading, primary/accent, neon, neon-accent, scanline color). Reuse the existing panel/neon/crt selector patterns so no component code changes.
2. **`src/pages/Index.tsx`** — extend `ThemeId` union and the `THEMES` array with the 6 new entries so they appear in the theme picker dropdown. Persistence via existing `THEME_STORAGE_KEY` works automatically.

### Non-goals

- No version bump.
- No new components, no changes to visualizer/plasma/tunnel defaults.
- Not pixel-copying scenestream screenshots — these are palette-level tributes that fit the existing panel/neon system.
