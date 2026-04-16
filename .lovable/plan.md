

## Plan: Smiley emoticons in the Oneliner

### Approach

Build a smiley map of all ~130 codes from `scenestream.net/demovibes/smileys/` and render them inline in the Oneliner messages by replacing each code (e.g. `:)`, `:beer:`, `<3`) with the matching `<img>`.

The smiley GIFs/PNGs are hosted on `scenestream.net/static/emoticons/...`. Browsers load `<img>` cross-origin without CORS, so we can reference those URLs directly — no proxy, no asset import.

### Implementation

**1. New file `src/lib/smileys.ts`**
- Export a `SMILEYS` record mapping every code → full image URL (all ~130 from the source page, including `:)`, `:(`, `;)`, `<3`, `</3`, `D:`, `:beer:`, `:lol:`, `:necta:`, `:dance:`, `:facepalm:`, meme set, xmas set, atari/amiga set, etc.).
- Export `renderWithSmileys(text: string): ReactNode[]` that scans the text and splits it into a mix of strings and `<img>` nodes.
- Tokenizer rules:
  - Build a single regex from all codes, sorted **longest-first** so `:facepalm2:` matches before `:facepalm:` and `</3` before `<3`.
  - Properly escape regex special chars (`(`, `)`, `*`, `[`, `|`, `<`, `^`, etc.).
  - For each match, emit an `<img>` with `src`, `alt={code}`, `title={code}`, `loading="lazy"`, `className="inline-block h-4 align-text-bottom mx-0.5"` (keeps line height tidy in the panel).
  - Non-matching segments stay as plain text.

**2. Update `src/pages/Index.tsx`**
- Import `renderWithSmileys`.
- In the Oneliner panel, replace `{entry.text}` with `{renderWithSmileys(entry.text)}`.
- No other changes.

### Notes
- Codes like `:)` and `;)` use ASCII punctuation that is unlikely to appear elsewhere in the chat in a way that should NOT be replaced — matching plain text the same way the original site does is the desired behavior.
- The `:|` and `;(` codes from the table will also be matched; harmless for chat content.
- Images hotlinked from scenestream are already used elsewhere on that site; no caching/storage needed.

### Files
- **New**: `src/lib/smileys.ts`
- **Update**: `src/pages/Index.tsx` (one-line change in the oneliner render)

