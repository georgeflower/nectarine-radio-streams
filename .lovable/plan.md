## Problem

The screenshot shows `Sarcophaser` rated **3.18 (11 votes)** in the app, but the upstream Scenestream page shows **4.25 (93 votes)**. The song id is the same — the value in the app is just stale.

`src/lib/entityCache.ts` caches every entity (song / artist / group / compilation) in `localStorage` **forever**. Once an entry exists it is never refetched, so ratings and vote counts frozen on first lookup never update — even across days. `SongRating` / `SongPlatform` only call `requestInfo()` when the cached value is missing the field, which it isn't.

## Fix — stale-while-revalidate with a TTL

Add a per-entry timestamp and a freshness check. Songs (which carry rating + votes) get a short TTL; other kinds get a longer one.

### Changes in `src/lib/entityCache.ts`

1. Store entries as `{ info, fetchedAt }` instead of bare `EntityInfo`. Bump the storage prefix to `nectarine-entity-cache-v3-` (old v2 entries are simply ignored / re-fetched).
2. Add `isStale(kind, fetchedAt)`:
   - `song`: 2 minutes (rating/votes change)
   - `artist` / `group` / `compilation`: 24 hours
3. `getCachedInfo()` keeps returning the cached `info` immediately (no UI flicker), but `requestInfo()` now also triggers a background refetch when the entry is stale (in addition to when it's missing).
4. `resolveOne()` updates `fetchedAt` on every successful fetch and notifies subscribers — existing components already re-render via `subscribe`.

### Changes in `src/pages/Index.tsx`

`SongRating` and `SongPlatform` should always call `requestInfo("song", songId)` on mount / when `songId` changes. The cache layer decides whether that turns into a network call. This guarantees a freshness check every time a new song becomes the "now playing" track, while still showing the cached value instantly.

No other components need changes — they all go through `getCachedInfo` / `requestInfo` already.

## Result

- First render still shows cached rating instantly (no flash of empty state).
- Within a couple of seconds the value silently updates to the live rating/votes.
- When a song repeats hours later it is automatically refreshed.
