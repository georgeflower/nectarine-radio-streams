

## Goal
Show a small platform indicator (e.g. "AMIGA-MOD") next to each song name and make it a clickable link to the Scenestream platform listing page (all songs on that platform).

## Where platform data comes from
The song detail XML (already fetched lazily by `entityCache.ts` for ratings) contains:
```xml
<platform id="6">AMIGA-MOD</platform>
```
Platform URL on Scenestream uses the **id**: `https://scenestream.net/demovibes/platform/6/` (verified — name slug returns 404, id returns 200).

## Changes

### 1. `src/lib/entityCache.ts`
Extend `EntityInfo` for songs to include platform data:
- `platformId?: string`
- `platformName?: string`

In `extractInfo` for the `song` case, read:
```ts
const platformEl = root.getElementsByTagName("platform")[0];
const platformId = platformEl?.getAttribute("id") || "";
const platformName = platformEl?.textContent?.trim() || "";
```
and include them in the returned info.

### 2. `src/lib/nectarine.ts`
Update `platformUrl` to accept an id (it already does — just keep it; we'll pass the id). No code change needed; the helper already builds `/demovibes/platform/{value}/`.

### 3. `src/pages/Index.tsx`
Create a small `SongPlatform` component (mirroring the existing `SongRating` pattern):
- Subscribes to entity cache for the given `songId`.
- Triggers `requestInfo("song", songId)` if not loaded (already done by `SongRating`, but safe to call again — it's idempotent).
- When `info.platformId` & `info.platformName` are present, render a compact pill/link:
  ```tsx
  <a href={platformUrl(info.platformId)} target="_blank" rel="noopener noreferrer"
     className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-border rounded-sm hover:border-primary hover:text-primary transition-colors"
     title={`All songs on ${info.platformName}`}
     onClick={(e) => e.stopPropagation()}>
    {info.platformName}
  </a>
  ```

Place `<SongPlatform songId={...} />` right after the song name link in three spots:
- Currently Playing (`now.song`)
- Up Next queue items
- Recently Played history items

(Order: song name → platform pill → rating.)

## Acceptance
- A small platform tag (e.g. "AMIGA-MOD") appears next to song titles in Now Playing, Queue, and History as soon as song details load.
- Clicking the tag opens `https://scenestream.net/demovibes/platform/{id}/` in a new tab.
- No tag is rendered for songs without a platform field or while details are still loading.

