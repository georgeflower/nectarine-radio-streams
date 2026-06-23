## Problem

The "Your app will live here / Ask Lovable to build it" image on the iOS lockscreen is `public/placeholder.svg` — the Lovable default — used as the MediaSession fallback in `AudioPlayer.tsx`. Even with the new `song-artwork` system, iOS still shows the placeholder because:

1. The fallback points at the Lovable placeholder SVG.
2. Screenshot URLs from scenestream are `.gif` — iOS Safari MediaSession does not render animated GIFs as artwork.
3. iOS commits the first `MediaMetadata` it sees for a track and often ignores later updates, so the async fetch's result arrives too late.

## Fix

### 1. Replace the fallback artwork

In `src/components/AudioPlayer.tsx`:

- Change `FALLBACK_ARTWORK` from `/placeholder.svg` to `/apple-touch-icon.png?v=20260611a` (already in `public/`, 180×180 PNG, valid on iOS).
- Pass an explicit `type: "image/png"` for the fallback in the `MediaMetadata.artwork` array.

### 2. Serve a PNG (not GIF) for song screenshots

Update `supabase/functions/song-artwork/index.ts` to return a proxied PNG URL instead of the raw `.gif`:

- Add a second route on the same function: `?songId=…&img=1` streams the screenshot (or platform icon) as `image/png`, converting via `ImageScript` (Deno-native) or by re-encoding the first frame. If conversion isn't trivial in Deno, simply proxy the bytes through with `Content-Type: image/png` only when the upstream is already PNG (platform icons), and proxy GIFs as `image/gif` but also expose a `?frame=1` PNG snapshot using `https://wsrv.nl/?url=…&output=png&n=1` as a transformer.
- JSON response now returns:
  - `screenshotUrl`: `https://wsrv.nl/?url=<encoded scenestream gif>&output=png&n=1&w=512&h=512&fit=contain`
  - `platformIconUrl`: original PNG (already PNG-safe), optionally also routed through `wsrv.nl` for consistent sizing.

`wsrv.nl` is a free public image proxy that already does GIF→PNG and is CORS-friendly; no new infra needed. (If preferred, the same can be done inside the edge function with a small WASM decoder, but `wsrv.nl` is simpler and proven.)

### 3. Resolve artwork synchronously when possible

In `src/lib/songArtwork.ts` and `AudioPlayer.tsx`:

- When `currentSongId` changes and we have **no** cached entry, immediately set MediaSession metadata with just the fallback, then `await` the fetch (≤1 fetch per song) and re-set metadata with the resolved URL.
- After the resolved URL is set, also call `mediaSession.metadata = mediaSession.metadata` reassignment trick (recreate `new MediaMetadata(...)`) — iOS sometimes requires a full reassignment to re-render the artwork.
- Pre-fetch the next track's artwork as soon as `now.nextSongId` is known (if exposed by `nowPlaying`) so the cache is warm before the track flip.

### 4. Quick test

- Extend `src/test/songArtwork.test.ts` with one case asserting the returned `screenshotUrl` is routed through `wsrv.nl` (string contains `wsrv.nl` and the original gif URL is URL-encoded inside).
- No UI test needed; the on-screen UI doesn't change.

## Out of scope

- No on-screen UI changes.
- No version bump or changelog entry (separate request).
- `public/placeholder.svg` itself is left alone — only the MediaSession reference to it changes.

## Files touched

- `src/components/AudioPlayer.tsx` — new fallback URL + synchronous resolution path.
- `src/lib/songArtwork.ts` — async `resolveOne` returns and exposes a promise; helper for pre-warm.
- `supabase/functions/song-artwork/index.ts` — wrap screenshot URL with `wsrv.nl` PNG transform.
- `src/test/songArtwork.test.ts` — assertion on transformed URL.
