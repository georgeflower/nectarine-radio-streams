# Last.fm Scrobbling

Add per-user Last.fm login + now-playing + scrobble for the currently streaming track. Auth and scrobble requests must be signed with the API secret, so signing happens in edge functions; the resulting session key is stored locally in the browser (one user per device, no DB needed).

## Prerequisites (user action)

1. Create a Last.fm API account: https://www.last.fm/api/account/create
   - Callback URL: the app's published URL (e.g. `https://demoscene-radio-compact.lovable.app/`) — the auth flow returns the user to wherever the login was started.
2. After approval, I will request two secrets via `add_secret`:
   - `LASTFM_API_KEY`
   - `LASTFM_API_SECRET`

## Auth flow (Last.fm web auth)

```text
[Login button] -> window.location = https://www.last.fm/api/auth/?api_key=KEY&cb=<current url>
   user approves on last.fm
-> redirect back with ?token=XYZ in URL
-> frontend detects ?token, calls edge fn `lastfm-auth` { token }
-> edge fn signs auth.getSession, returns { sessionKey, username }
-> frontend stores { sessionKey, username } in localStorage("lastfm-session")
-> frontend strips ?token from URL
```

## Scrobble flow

Hook into `AudioPlayer.tsx` track changes (artist + title already resolved via `nowPlaying.ts` / MediaSession code).

Per Last.fm rules:
- Call `track.updateNowPlaying` immediately when a new track starts.
- Call `track.scrobble` once the track has played for >= 240s OR >= 50% of its duration (whichever comes first), and only if the track is > 30s long. For unknown-duration streams (Nectarine radio), use a 60-second minimum listen time before scrobbling.
- Dedupe so the same artist+title isn't scrobbled twice in a row.

Both calls go through edge function `lastfm-scrobble` with `{ sessionKey, method: "nowplaying" | "scrobble", artist, title, timestamp? }`. The edge function signs the request with `LASTFM_API_SECRET` and POSTs to `https://ws.audioscrobbler.com/2.0/`.

## UI

- **Main page (`src/pages/Index.tsx`)**: Add a small Last.fm chip near the existing controls — "Connect Last.fm" when logged out, "Scrobbling as <username> (logout)" when logged in.
- **Cracktro settings**: Add the same control to the existing settings panel in `Cracktro.tsx`.
- A shared `useLastfm()` hook in `src/lib/lastfm.ts` owns the localStorage session, exposes `{ session, login(), logout(), scrobble(track), nowPlaying(track) }`, and triggers a re-render across components via a tiny store (same pattern as `cracktroUi.ts`).
- On mount, `Index.tsx` checks `?token=` and if present calls the edge function to exchange it, then `history.replaceState` to clean the URL.

## Files to add

- `supabase/functions/lastfm-auth/index.ts` — signed `auth.getSession`, returns `{ sessionKey, username }`.
- `supabase/functions/lastfm-scrobble/index.ts` — signed `track.updateNowPlaying` and `track.scrobble`.
- `src/lib/lastfm.ts` — client store, hook, and helpers (md5 not needed client-side; signing is server-side).
- `src/components/LastfmButton.tsx` — login/logout chip reused in both places.
- `src/test/lastfm.test.ts` — unit tests for listen-threshold logic and dedupe.

## Files to edit

- `src/pages/Index.tsx` — mount `<LastfmButton/>`, handle `?token=` callback once.
- `src/components/Cracktro.tsx` — mount `<LastfmButton/>` in the settings overlay.
- `src/components/AudioPlayer.tsx` — when the resolved (artist, title) changes, call `nowPlaying()`; start a listen timer and call `scrobble()` when the threshold is met.
- `src/components/ChangelogModal.tsx` + `package.json` — bump to v0.6.7 with a Last.fm entry.
- `README.md` / `docs/architecture.md` — note the new edge functions and auth flow.

## Notes / non-goals

- No database table — session lives in `localStorage` per browser; logout just clears it.
- The API key is sent to the browser only via the redirect URL constructed by the edge function (or as a `VITE_` non-secret if you prefer). I'll keep it server-side: a new `lastfm-auth?action=login-url` GET returns the redirect URL, so the API key never ships in the client bundle.
- No retry queue for offline scrobbles in this iteration; failed scrobbles are logged to the console only.
