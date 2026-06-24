# Show song screenshot on car head units (CarPlay / Android Auto)

## Background

Car head units (CarPlay, Android Auto) display whatever the phone's browser publishes through `navigator.mediaSession.metadata.artwork`. The player already sets this in `src/components/AudioPlayer.tsx` using the resolved song screenshot (or the app icon fallback), so the mechanism is in place — no new feature is needed.

The remaining work is reliability: car head units are pickier than phone lockscreens about artwork format, size, and MIME type, and iOS only mirrors MediaSession to CarPlay when the page is the foreground media source (Safari tab in foreground, or installed as a PWA via Add to Home Screen).

## What to change

All changes stay in `src/components/AudioPlayer.tsx` in the MediaSession `useEffect`:

1. **Force PNG + correct MIME.** The screenshot URL already comes from `wsrv.nl` as PNG. Hardcode `type: "image/png"` for screenshot/fallback artwork instead of inferring from the URL, so head units that key off `type` don't reject it.

2. **Guarantee a 512×512 entry.** CarPlay prefers 512×512. Today we advertise the same URL at sizes 96/192/256/384/512 but the underlying image is requested at whatever size `songArtwork` produced (usually 512). Add explicit `w=` query params per size on the wsrv.nl URL so each `artwork[]` entry actually resolves to an image of that size — head units that pick the closest match then get a real 512.

3. **Always include the app-icon fallback as a second entry.** If the screenshot URL ever 404s on the car (CORS, network), having `/apple-touch-icon.png` listed as a second artwork item lets the head unit fall back without going blank.

4. **No-op guard.** Skip rewriting `mediaSession.metadata` when title/artist/artwork are unchanged, to avoid flicker on car displays that redraw on every metadata write.

## User-facing notes (to add to the changelog entry, no doc rewrite)

- On iPhone, CarPlay only shows the artwork while Safari with the site is the active media app, or when the site is installed to the Home Screen as a PWA and launched from there.
- On Android, Chrome forwards MediaSession art to Android Auto automatically.
- If no screenshot exists for the song, the app icon shows instead (already implemented).

## Technical details

File: `src/components/AudioPlayer.tsx`

- In the MediaSession `useEffect` (around the `new MediaMetadata({...})` call):
  - Build artwork list as: primary screenshot URL with explicit per-size `w=`/`h=` on the wsrv.nl URL, `type: "image/png"`, sizes `96/192/256/384/512`; then app-icon fallback at `512x512`, `image/png`.
  - Drop `inferArtworkType` for this path (keep the helper for station artwork if still used elsewhere; otherwise remove).
  - Wrap the metadata assignment in a ref-based diff (`lastMetaKey = title|artist|artworkSrc`) so identical updates are skipped.

No changes to `src/lib/songArtwork.ts` or the `song-artwork` edge function — they already return a wsrv.nl PNG URL.

## Out of scope

- No CarPlay-specific SDK (web apps can't use it; MediaSession is the only channel).
- No changes to the screenshot resolution logic.
- No version bump unless you want one after the change lands.
