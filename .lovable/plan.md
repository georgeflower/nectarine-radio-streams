

## Plan: Country flags + theme switcher (3 themes)

### 1. Country flags

XML provides `flag="SE"` (or lowercase) on `<author>` and `<user>` elements. I'll:

- Update `parseOneliners` and `parseOnline` in `src/lib/nectarine.ts` to also capture the `flag` attribute.
  - `OnelinerEntry` gains `flag: string`
  - `parseOnline` returns `{ users: { name: string; flag: string }[]; total: number }`
- Render flags via `https://flagcdn.com/16x12/{cc}.png` (free, fast, no key). Lowercase the code, fall back to nothing if missing.
- New tiny component `<Flag code="SE" />` rendered inline in:
  - Each oneliner entry, before the username
  - Each online user in the comma list (rebuilt as `<span>` chips with flag + name)

### 2. Theme switcher (3 themes)

Add a theme system using a `data-theme` attribute on `<html>`. CSS variables for each theme live in `src/index.css`.

**Themes:**
1. **`crt`** (current) — amber demoscene CRT, scanlines, glow
2. **`gem`** — Atari ST GEM Desktop: bright green desktop (`#00AA00`-ish), white window chrome with black borders, black title bar with white text when active, system font (Chicago/SysFont feel — use a chunky pixel-friendly stack), no glow, no scanlines, square corners, simple 1px black borders
3. **`workbench`** — Amiga Workbench 1.3: medium blue background (`#0055AA`), orange (`#FF8800`) window chrome and accents, white panels with black text, classic Topaz-style feel via bold monospaced font, blue/orange/white/black 4-color palette

Each theme overrides the same set of design tokens (`--background`, `--foreground`, `--card`, `--primary`, `--accent`, `--border`, `--muted`, `--panel-shadow`, `--scanlines`, etc.). The `.crt::before` overlay and `.neon` glows become no-ops on `gem` and `workbench` (override to `none`).

**UI:**
- New `<select>` placed in the header, immediately left of the Refresh button, styled with the existing button look.
- Options: "CRT Amber", "Atari ST GEM", "Amiga Workbench".
- Persist selection in `localStorage` under `nectarine-theme`; apply on mount via `document.documentElement.dataset.theme`.

**Implementation file map:**
- `src/index.css` — keep `:root` as CRT defaults; add `[data-theme="gem"]` and `[data-theme="workbench"]` blocks overriding tokens; neutralize `.crt::before` / `.neon` glow per theme.
- `src/lib/theme.ts` (new) — `THEMES` list, `applyTheme(id)`, `loadTheme()`.
- `src/components/ThemeSwitcher.tsx` (new) — styled `<select>`.
- `src/pages/Index.tsx` — mount switcher in header (left of Refresh), use updated parsers, render `<Flag>` in oneliner + online users.
- `src/components/Flag.tsx` (new) — `<img>` to flagcdn with alt and lazy loading.
- `src/lib/nectarine.ts` — add `flag` to `OnelinerEntry`, change `parseOnline` return type.

### Notes
- Visualizer uses `hsl(var(--primary))` indirectly via hardcoded amber hues — I'll switch its palette to read from CSS variables so it adapts per theme (green stars on GEM, orange on Workbench).
- Theme dropdown uses native `<select>` for zero extra deps and easy theming.

