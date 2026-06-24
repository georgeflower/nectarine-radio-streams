## Problem

The edge function currently assumes `songId === screenshotId` and fetches `scenestream.net/demovibes/screenshot/{songId}/`. That's wrong — e.g. song `41294` has screenshot `52807`. Result: artwork misses or shows the wrong image.

## Fix

Update `supabase/functions/song-artwork/index.ts` to do a two-step lookup:

1. **Fetch the song page** `https://scenestream.net/demovibes/song/{songId}/`.
2. **Parse it** for a link to `/demovibes/screenshot/{id}/` (regex: `/demovibes/screenshot/(\d+)/`). Also grab the platform icon `<img class="platform_icon" src="...">` from this page as the fallback — it's present on the song page directly.
3. **If a screenshot ID is found**, fetch `https://scenestream.net/demovibes/screenshot/{screenshotId}/` and parse the `<img class="screenshot">` source as before.
4. **If no screenshot link exists**, skip step 3 and return only `platformIconUrl` (from the song page).
5. Keep wrapping both URLs through `toPng()` (`wsrv.nl`) so iOS MediaSession renders them.

Response shape stays the same: `{ songId, screenshotUrl?, platformIconUrl? }`. Cache headers unchanged.

### Test update

In `src/test/songArtwork.test.ts`, the existing tests stub the client `fetch` so they don't exercise the edge function's HTML parsing — they keep passing. No new client test needed; the edge function change is server-side parsing only.

Optionally add a quick verification step after deploy: `curl` the function with `songId=41294` and confirm `screenshotUrl` contains `52807`, and `songId=37334` still works.

## Files touched

- `supabase/functions/song-artwork/index.ts` — two-step fetch + platform icon from song page.

## Out of scope

- No client-side changes (`AudioPlayer.tsx`, `songArtwork.ts` unchanged).
- No UI changes.
