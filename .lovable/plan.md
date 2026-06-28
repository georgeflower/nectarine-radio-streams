# Last.fm Scrobbling Integration

You shared the API key and shared secret. I'll store them as backend secrets (`LASTFM_API_KEY`, `LASTFM_API_SECRET`) — never exposed to the browser — and build the integration around them.

## Auth flow (Last.fm Web Auth)

1. User clicks **Connect Last.fm** (in the main page header and in the Cracktro settings panel).
2. We redirect to `https://www.last.fm/api/auth/?api_key=…&cb=<app-url>`.
3. Last.fm redirects back to the app with `?token=…`.
4. `Index.tsx` detects the token, calls our `lastfm-auth` edge function which signs `auth.getSession` with the shared secret and returns the session key + username.
5. Session key + username are stored in `localStorage` (`lastfm.session`). The shared secret stays server-side.

## Scrobbling rules (per Last.fm spec)

- Fire **`track.updateNowPlaying`** when a track starts playing.
- Fire **`track.scrobble`** when the track has played for ≥ 240 seconds **or** ≥ 50% of its duration, whichever comes first, and the track is longer than 30 seconds.
- Only one scrobble per track instance; reset on track change.
- Both calls go through a `lastfm-scrobble` edge function that signs the request with the shared secret.

## Files to add / change

**New edge functions** (CORS enabled, no JWT required):
- `supabase/functions/lastfm-auth/index.ts` — exchanges `token` → session key via signed `auth.getSession`.
- `supabase/functions/lastfm-scrobble/index.ts` — accepts `{ session, artist, track, action: "nowplaying" | "scrobble", timestamp?, duration? }` and signs the request.

**New client files:**
- `src/lib/lastfm.ts` — session storage, `useLastfm()` hook (`session`, `username`, `login()`, `logout()`, `handleCallback()`), helpers `sendNowPlaying()` / `sendScrobble()`.
- `src/components/LastfmButton.tsx` — Connect / Connected-as-`<user>` (with logout) button styled to match the existing UI.

**Edits:**
- `src/pages/Index.tsx` — mount `LastfmButton` in the header; on mount, if `?token=` is in the URL, call `handleCallback()` and clean the URL.
- `src/components/Cracktro.tsx` — add `LastfmButton` to the settings/controls panel.
- `src/components/AudioPlayer.tsx` — when `currentTrack` changes and we have a Last.fm session: send Now Playing immediately; start a timer that scrobbles once the 50%/240s threshold is met. Clear timer on track change/stop.

## Technical notes

- Last.fm signature: concatenate sorted `key+value` params (excluding `format` and `callback`), append shared secret, MD5 hex. The edge function does this with Deno's `crypto.subtle` + a tiny MD5 helper (Last.fm requires MD5 specifically).
- Artist/track parsing reuses the existing `currentTrack` metadata (`artist`, `title`) already normalized in `AudioPlayer.tsx`.
- No DB tables — session lives in `localStorage` only.
- Callback URL registered with Last.fm: `https://demoscene-radio-compact.lovable.app` (already set).

## Out of scope

- No "love track" button, no scrobble history UI, no multi-account support — can add later if you want them.
