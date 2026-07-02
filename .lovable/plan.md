## Three separate fixes

### 1. Last.fm scrobbling "not authorized"

**Root cause candidates (need to verify one at a time):**

- The frontend builds the auth URL with a hardcoded `LASTFM_API_KEY = "79ba44ee3d4dd0dff77eedf557b0fd3b"` in `src/lib/lastfm.ts`, but the two edge functions (`lastfm-auth`, `lastfm-scrobble`) call the Last.fm API with `Deno.env.get("LASTFM_API_KEY")` + `LASTFM_API_SECRET`. If those two values are not from the **same registered Last.fm API app**, `auth.getSession` returns "Invalid API key" / "Unauthorized Token", the frontend logs `[lastfm] auth failed` in the console, and the session is never stored — so every subsequent scrobble call short-circuits at `if (!current) return`.
- Last.fm requires the callback URL passed to `auth/?cb=` to match the "Callback URL" registered on the API app page. We currently send `window.location.origin + window.location.pathname`, which is different for `id-preview--…lovable.app`, `demoscene-radio-compact.lovable.app`, and any custom domain. If the registered callback is a single URL, auth silently fails on the other origins.
- After a successful `auth.getSession`, `handleLastfmCallback` strips the `?token=` param but there is no user-visible success or failure toast, so a failed exchange looks like "it did nothing".

**Fix:**

1. Add temporary structured logging in `lastfm-auth` (log the Last.fm response body when `session.key` is missing) and in the frontend `exchangeToken` (surface the error string via a toast so the user sees exactly why it failed).
2. Add a diagnostics endpoint / one-shot log in `lastfm-auth` that prints `LASTFM_API_KEY` **length + first/last 4 chars only** and confirms the secret is loaded and matches the frontend key's prefix. Never log the full key/secret.
3. If the frontend hardcoded key and the secret's key do not match, unify them: keep the API key in code (it's a publishable value) and store only `LASTFM_API_SECRET` in Lovable Cloud, OR pass the frontend key into the edge function request and validate. Recommended: expose the API key from the edge function via a small `lastfm-config` function (or hardcode the same string in the edge function) so we have a single source of truth.
4. Re-check the Last.fm application settings and ensure the Callback URL is set to a value that matches how users actually reach the app (published `demoscene-radio-compact.lovable.app` + any custom domain). If Last.fm only supports one callback, funnel all environments through the published URL and redirect back after exchange.
5. Add a visible "Last.fm status" indicator: after `handleLastfmCallback`, if there was a `?token=` param but no session got stored, show a toast with the actual Last.fm error message.
6. Add a small "Test scrobble" button in the diagnostics panel that calls `sendNowPlaying` with the current track and surfaces the raw response, so we can distinguish auth failure from scrobble failure.

### 2. Mobile stream jumps back to a track from several minutes ago

**Root cause:**

In `AudioPlayer.tsx`, the mobile background-resume watchdog (`doWake`) prefers `a.play()` as a "soft resume" whenever `sinceProgress < stallTimeoutMs`. When the OS suspends the tab, the `<audio>` element keeps its internal buffer. On resume, `play()` continues from `currentTime`, which is minutes behind live — so the listener hears the old song that was playing when the phone was locked.

Also, when mobile mode uses the direct stream URL, some Icecast/Shoutcast endpoints replay the recent chunk buffer to new listeners on reconnect; combined with our soft resume this compounds the delay.

**Fix:**

1. Track the timestamp of the last user-visible playback event and the timestamp when the tab was hidden. If the tab was hidden for more than a configurable threshold (default ~10s on iOS, ~20s on Android — reuse `WatchdogConfig`), skip soft resume and instead:
   - Force a live-edge seek: `a.currentTime = a.seekable.end(a.seekable.length - 1)` when `seekable` is non-empty.
   - If the source is Icecast/Shoutcast (which is non-seekable), fully reload the element via `playUrl(selectedUrl, /* cacheBust */ true)` so we drop the stale internal buffer and reconnect to the live edge.
2. Only allow the "soft resume" path when the tab was hidden for a very short interval (e.g. <3s) — otherwise assume the buffer is stale.
3. Log both branches through `logPlayback` with a new category `live-edge` so the diagnostics panel shows why each resume chose reload vs. soft resume.
4. Add two configurable thresholds to `WatchdogConfig`: `iosLiveEdgeReloadAfterHiddenMs`, `androidLiveEdgeReloadAfterHiddenMs`, editable from the diagnostics panel.

### 3. Phone sometimes opens an older version of the app

**Root cause:**

The app has no service worker (correct — we should keep it that way per Lovable's default), but `site.webmanifest` declares `display: standalone`, so users can add it to the iOS/Android home screen. iOS caches the `start_url` HTML aggressively for installed PWAs and shows it before the network request completes. Our `startVersionCheck` does compare hashed asset signatures and hard-reloads on mismatch, but:

- It reads from `localStorage`; in private-mode / storage-evicted installs the stored signature can be missing, so the first-visit branch runs and no reload happens even when the served HTML is stale.
- The reload only fires *after* the freshness fetch resolves, so users may see the stale UI for a second or two before it swaps.
- There is no user-visible "you are on an old build" indicator.

**Fix:**

1. In `versionCheck.ts`, in addition to comparing to `localStorage`, embed the build-time signature into the bundle at compile time (Vite `define`: `__BUILD_ID__ = Date.now()` or the git SHA if available) and compare the *currently executing* bundle's signature against the freshly fetched HTML's asset hashes. If they differ, hard-reload — this works even on a fresh install with no localStorage.
2. Add a defensive kill-switch cleanup: on app mount, unregister any stray service workers registered by an earlier build/experiment (`navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`) and clear caches whose name starts with `workbox-` / `qumran-`. This handles users whose phone has an SW installed from an old version.
3. Show the current version in the header (or the Settings popover) with a tiny "Update available" pill when a new signature is fetched — one tap runs the hard reload immediately instead of waiting for the next natural page load.
4. Trigger the freshness check more aggressively on installed-app entry: also on `pageshow` non-persisted (already partially covered) and on `resume` from lockscreen (via `visibilitychange`) with a small debounce.
5. Ensure the deployed `index.html` is served with `Cache-Control: no-cache` at the CDN level (the meta tags in `<head>` are advisory only — most CDNs ignore them). If we don't control the CDN header, at minimum add a `<link rel="preload" href="/?v=BUILD">` trick or add a small inline script at the very top of `<head>` that fetches `/?v=<Date.now()>` and forces a reload on hashed-asset mismatch **before** the main bundle runs — a "poor man's SW".

### Verification

- Last.fm: after fix, open Connect Last.fm, complete flow, check console for `[lastfm] auth failed` — should be gone. The username should appear in the header. Then wait 4 minutes into a track and confirm scrobble arrives at last.fm/user/<name>.
- Mobile stream: lock phone for 30s, unlock — the diagnostics panel should show `live-edge:reload` and the now-playing title should match the freshly fetched one, not the pre-lock title.
- App version: bump `APP_VERSION`, redeploy, open the installed PWA, confirm the old build reloads within a couple seconds without a manual pull-to-refresh.
