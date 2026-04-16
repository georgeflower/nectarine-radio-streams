

## Plan: BBCode rendering in OneLiner (and other text)

Add a BBCode parser/renderer that converts the tags from https://scenestream.net/forum/thread/14/ into proper React elements. Apply it to the OneLiner text (the only user-generated text currently shown). External entity tags (`[song]`, `[artist]`, `[user]`, etc.) become clickable links that open in a new tab, mirroring the existing `ExtLink` behavior.

### New file: `src/lib/bbcode.tsx`

Exports `renderBBCode(text: string): ReactNode[]` that:
1. Tokenizes the input by scanning for `[tag]…[/tag]`, `[tag=attr]…[/tag]`, and self-closing/standalone forms.
2. Recursively renders children (so `[b][i]x[/i][/b]` works), and runs `renderWithSmileys` on plain-text leaves so smileys keep working inside BBCode.
3. Unknown / mismatched tags fall back to literal text.

### Tags supported

**Formatting (oneliner-applicable):**
- `[b] [i] [s]` → `<strong> <em> <s>`
- `[big] [small]` → wrapper spans with scaled font-size (nestable once)
- `[size=N]` → `<span style="font-size:Npx">` (clamped 6–50)
- `[center]` → `<div class="text-center">`
- `[color=#hex]` and named colors (`[red] [green] [blue] [brown] [cyan] [darkblue] [gold] [grey] [magenta] [orange] [pink] [purple] [white] [yellow] [black]`)
- `[silly1]…[silly5]` → CSS-animated spans (rotate / mirror / wobble / hover-skew). Add small keyframes block in `src/index.css`.
- `[code] [pre]` → `<code> <pre>` with monospace styling
- `[quote]` and `[quote=name]` → bordered block, optional "X said:" header

**Links / media:**
- `[url]…[/url]` and `[url=https://…]label[/url]` → external link (new tab)
- `[email]…[/email]` and `[email=a@b]label[/email]` → `mailto:`
- `[img]https://…[/img]` → `<img>` with max-width, lazy loaded
- `[yt]VIDEOID[/yt]` and `[yt=label]ID[/yt]` → link to `https://www.youtube.com/watch?v=ID` (lighter than embedding; matches the wiki examples in the OneLiner context)

**Scenestream entity references** — all open in a new tab on `https://scenestream.net/...`:
- `[song]ID[/song]` → link to `/demovibes/song/ID/`
- `[queue]ID[/queue]` → same target as `[song]`, styled as a small "▶ queue" button
- `[user]name[/user]` → link to `/demovibes/user/name/` (uses `userUrl` helper)
- `[artist]ID[/artist]` → link to `/demovibes/artist/ID/`
- `[group]ID[/group]` → link to `/demovibes/group/ID/`
- `[label]ID[/label]` → link to `/demovibes/label/ID/`
- `[platform]ID-or-name[/platform]` → link to `/demovibes/platform/<value>/`
- `[compilation]ID-or-name[/compilation]` → link to `/demovibes/compilation/<value>/`
- `[thread]ID[/thread]` → link to `/forum/thread/ID/`
- `[forum]slug[/forum]` → link to `/forum/<slug>/`
- `[theme]ID[/theme]` → link to `/demovibes/theme/ID/`
- `[faq]ID[/faq]` → link to `/demovibes/faq/ID/`
- `[flag]xx[/flag]` → reuse existing `<Flag code="xx" />` component

For entity references where only an ID is provided (e.g. `[song]11984[/song]`), the displayed label is the ID itself (e.g. "song #11984") — we don't have a way to look up titles client-side without extra API calls. Plain link text keeps it simple and clickable.

**Tables:** `[table] [tr] [th] [td]` → `<table>/<tr>/<th>/<td>` with a minimal bordered Tailwind style.

### Helper additions: `src/lib/nectarine.ts`

Add small URL helpers (alongside existing `songUrl/artistUrl/userUrl`):
- `groupUrl`, `labelUrl`, `platformUrl`, `compilationUrl`, `threadUrl`, `forumUrl`, `themeUrl`, `faqUrl`

### Wiring: `src/pages/Index.tsx`

Replace `renderWithSmileys(entry.text)` in the OneLiner list with `renderBBCode(entry.text)`. The new renderer internally calls `renderWithSmileys` on text leaves, so smileys still appear.

### Styling: `src/index.css`

Add small keyframes for `silly3`, `silly4`, `silly5` plus a `silly1` (rotate 180°) and `silly2` (right-to-left direction) utility — scoped class names like `.bb-silly1` … `.bb-silly5`.

### Notes / scope

- BBCode also exists in the wider site (forum posts, song descriptions) but the app currently only renders OneLiner text, so that's the only integration point.
- `[size]` is clamped to the documented 6–50 range.
- Unknown tags render as literal text so nothing is silently dropped.
- No new dependencies; pure TS/React + Tailwind.

