

## Plan: Fix Nectarine API integration

Two problems to fix:

**1. Wrong endpoint paths** — code uses `now_playing.xml`, `users.xml`, etc. The real API uses path-style URLs: `queue/`, `oneliner/`, `online/`, `streams/`.

**2. CORS blocked** — `scenestream.net` sends no CORS headers, so every direct browser fetch fails with `NetworkError`. We need a server-side proxy.

### Approach

**Add Lovable Cloud + a single edge function `xml-proxy`** that fetches any whitelisted scenestream XML path server-side and returns the raw XML to the browser with proper CORS headers. This is the only reliable fix — without a proxy, no client-side fetch will ever work.

The function:
- Accepts `?path=queue` (or `oneliner`, `online`, `streams`, `artist/1`, `song/1`, `user/starchaser`, `user/Starchaser/favorites`, etc.)
- Validates path against an allowlist of known prefixes
- Fetches `https://scenestream.net/demovibes/xml/<path>/`
- Returns the response body as `application/xml` with `Access-Control-Allow-Origin: *`

**Rewrite `src/lib/nectarine.ts`** to:
- Replace the endpoint list with the correct path-style ones: `queue`, `oneliner`, `online`, `streams`
- Route every request through the edge function instead of fetching scenestream directly
- Update parsers to match the actual XML schema we just confirmed:
  - `queue/` → `<playlist><now>`, `<queue>`, `<history>` each with `<entry>` containing `<artist>`, `<song length="...">`, `<requester>`, `<playstart>`
  - `oneliner/` → list of message entries
  - `online/` → list of online users
  - `streams/` → list of stream URLs
- Drop the obsolete `now_playing.xml`, `users.xml`, `lastplayed.xml`, `news.xml`, `stats.xml` fallbacks (they 404)
- Drop the homepage HTML auto-discovery (it was a workaround for not knowing the endpoints)

**Rewrite `src/pages/Index.tsx`** panels to match the new data shape:
- "Currently Playing" reads from `queue` → `now/entry` (artist, song, length, requester, playstart). Compute "time left" from `playstart + length - now`.
- "Up Next" panel showing `queue/entry[]` (first 5)
- "Recently Played" panel showing `history/entry[]` (first 5)
- "Oneliner" reads from `oneliner/`
- "Who's Online" reads from `online/`
- "Streams" links read from `streams/`
- Keep the raw XML debug section, now showing the 4 real endpoints

### Files to change

- **New**: `supabase/functions/xml-proxy/index.ts` — Deno edge function with allowlist + CORS
- **New**: `supabase/config.toml` — register `xml-proxy` as public (`verify_jwt = false`)
- **Rewrite**: `src/lib/nectarine.ts` — new endpoints, proxy routing, new parsers for `playlist/now/queue/history`, `oneliner`, `online`, `streams`
- **Update**: `src/pages/Index.tsx` — new panels (Now Playing from queue.now, Up Next, Recently Played, Oneliner, Online, Streams)

### Out of scope (can add later)

Per-artist / per-song / per-user / per-favorites detail pages — these need a router and their own UI. Happy to add as a follow-up; the proxy will already support them via the allowlist.

