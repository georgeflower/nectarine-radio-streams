## Goal

When the app is added to the home screen on iOS/Android and audio is playing in the background, the OS lockscreen / notification widget currently shows a generic placeholder ("Your app will live here, Ask Lovable to build it"). Replace that artwork with the currently playing song's screenshot from scenestream.net, falling back to the platform symbol icon, falling back to the existing station artwork.

## How the data is sourced

scenestream.net does not expose screenshots through its XML API. The screenshot page `https://scenestream.net/demovibes/screenshot/{songId}/` is HTML and contains:

- `<img class="screenshot" src="/static/media/screenshot/image/XXXXX.gif">` when a screenshot exists
- `<img class="platform_icon" src="/static/media/platform/symbol/koek<name>.png">` for the song's platform (always present)

Both URLs are publicly fetchable by mobile OS lockscreen art renderers, so once the URL is known the browser does not need to proxy the actual image.

## Plan

### 1. New edge function `song-artwork`

`supabase/functions/song-artwork/index.ts`

- Accepts `?songId=<digits>`. Validates digits only.
- Fetches `https://scenestream.net/demovibes/screenshot/{songId}/`.
- Parses HTML with regex for `class="screenshot" src="(...)"` and `class="platform_icon" src="(...)"`.
- Returns JSON:
  ```json
  { "screenshotUrl": "https://scenestream.net/static/media/screenshot/image/00065367.gif",
    "platformIconUrl": "https://scenestream.net/static/media/platform/symbol/koeksid.png" }
  ```
  with `Cache-Control: public, max-age=3600` and full CORS headers. Either field can be missing.

Deploy via the standard edge function deployment so it gets a public URL under `${VITE_SUPABASE_URL}/functions/v1/song-artwork`.

### 2. `src/lib/songArtwork.ts` (new client module)

Small in-memory + `localStorage` cache (1 day TTL) keyed by `songId`:

- `getCachedSongArtwork(songId): { screenshotUrl?, platformIconUrl? } | undefined`
- `requestSongArtwork(songId): void` — fires the edge-function fetch in the background, dedupes inflight, stores on success, notifies listeners.
- `subscribeSongArtwork(fn): unsubscribe`

`getBestArtworkUrl(songId)` helper returns `screenshotUrl ?? platformIconUrl ?? undefined`.

### 3. Plumb song id + artwork into `AudioPlayer`

In `src/pages/Index.tsx` (around line 449) pass `currentSongId={now?.songId}` to `<AudioPlayer />`.

In `src/components/AudioPlayer.tsx`:

- Add `currentSongId?: string` to `Props`.
- Add a small hook that subscribes to `songArtwork` and triggers `requestSongArtwork(currentSongId)` whenever it changes.
- In the existing `mediaSession.metadata` effect (around line 426), prefer:
  1. song screenshot URL
  2. platform icon URL
  3. existing `stationConfig?.artworkUrl || selectedStream?.artworkUrl`
  4. current `FALLBACK_ARTWORK` placeholder
- Extend the effect's dependency array with the resolved artwork URL.
- Use `inferArtworkType` on the new URL (already supports `.gif`/`.png`).

No change to the on-screen UI — only the OS-level media metadata image changes.

### 4. Test

Add `src/test/songArtwork.test.ts` covering:

- Cache hit returns immediately, no fetch.
- `getBestArtworkUrl` prefers screenshot over platform icon.
- Subscribers are notified after a resolved fetch (mock `fetch`).

Existing `cracktroDefaults` and audio-related tests remain untouched.

## Out of scope

- No new on-screen art in the cracktro itself (only OS lockscreen).
- No version bump / changelog update (separate request).
- No change to the static favicon / web manifest icon (that's a different surface from MediaSession artwork).
