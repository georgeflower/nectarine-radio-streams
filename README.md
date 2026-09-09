# Nectarine Radio Streams

A retro-styled Nectarine / Demovibes radio client built with React + TypeScript.

This app combines live stream playback, Demovibes XML panels, visualizers, a windowed-or-fullscreen cracktro scene, and a flock of increasingly chaotic goose extras.

## Features

- Live stream playback from Demovibes stream listings, with bitrate-aware ordering and reliability-based demotion of flaky streams
- Direct HTTPS playback when possible, plus proxy fallback for mixed-content HTTP streams
- Stream retry, failover, live-edge recovery, and optional desktop MSE buffering for steadier playback
- Queue / now playing / history panels with song ratings, platform badges, and extra resource links when metadata is known
- Infamous OneLiner + online users panels with BBCode, smileys, links, flags, and ASCII-art-friendly rendering
- Seven active visualizer modes (`starfield`, `bars`, `plasma`, `oscilloscope`, `tunnel`, `rings`, `particles`), plus `off` and the beat overlay
- Adaptive quality: the visualizer auto-downgrades/upgrades between high / medium / low rendering tiers based on live FPS to stay smooth on lower-power devices and Firefox
- Audio reactivity tuning drawer (⚙ Settings → ♪ Reactivity…) — global frequency bands, beat/sparkle thresholds, and master intensity, plus per-visualizer bass/mid/treble gain and motion/glow/effect overrides, persisted per browser
- Performance tips modal (⚡ Performance tips) with browser recommendations, tuning guidance, and issue-reporting links
- Dismissible Firefox performance warning banner
- Ten themes, including the rotating `juN3bula` palette, plus scanlines, CRT grille, font scaling, and UI transparency controls
- Full changelog modal and a demoscene-flavoured “What’s New” popup on version bumps
- PWA version check detects stale cached bundles and auto-reloads when safe
- Playback diagnostics panel (draggable): reconnect log, stall counters, live-edge stats, stream reliability, Last.fm lights toggle, and test digest trigger
- Last.fm connect / reconnect flow, now-playing updates, scrobbling, and love / unlove controls on the current track
- Mobile screen wake lock so the display stays active while listening
- OS lockscreen artwork (iOS / Android) via Media Session — song screenshots with app-icon fallback
- Optional per-station now-playing metadata polling for Media Session metadata
- Windowed cracktro mode with optional browser fullscreen, draggable panels, tutorial hints, flying geese, goose family / roster, procreation toggle, and boing ball
- Browser-local goose learning with phrase memory + lexicon-based chatter, plus scripted platform banter and Rapture routines
- Song metadata caching pipeline backed by Supabase (`song-refresh`, `song-ingest`, `song-play`, `song-artwork`) to reduce repeat upstream fetches
- Anonymous listener pings, stream telemetry, and weekly digest support for operational stats
- Dedicated `/junebula` route for previewing the 14-day colour rotation

## Tech stack

- React 18.3 + React Router 6.30
- Vite 5.4
- TypeScript 5.8
- Tailwind CSS 3.4
- shadcn/ui + Radix UI primitives
- TanStack Query 5.83
- Supabase JS 2.108 + Supabase Edge Functions (Deno)
- Vitest 3.2 + Testing Library + jsdom
- Lockfiles for both npm (`package-lock.json`) and Bun (`bun.lock`, `bun.lockb`) are committed; examples below use npm

## Project structure

```text
src/
  components/
    AudioPlayer.tsx
    Visualizer.tsx
    BeatOverlay.tsx
    Cracktro.tsx
    PlaybackDiagnostics.tsx
    ReactivityDrawer.tsx
    RosterWindow.tsx
    SongLinks.tsx
    LastfmButton.tsx
    LoveButton.tsx
    ChangelogModal.tsx
    WhatsNewPopup.tsx
    ui/
  hooks/
    useWakeLock.ts
    use-mobile.tsx
  lib/
    nectarine.ts
    nowPlaying.ts
    bufferedStream.ts
    entityCache.ts
    songLog.ts
    songArtwork.ts
    streamRanking.ts
    streamTelemetry.ts
    playbackWatchdog.ts
    reactivitySettings.ts
    lastfm.ts
    junebula.ts
    gooseLearnedPhrases.ts
    gooseLearnedLexicon.ts
    gooseLife/
  pages/
    Index.tsx
    Junebula.tsx
    NotFound.tsx
  test/
    cracktroDefaults.test.tsx
    gooseSocial.test.ts
    gooseLife.test.ts
    junebula.test.ts
    nowPlaying.test.ts
    songArtwork.test.ts
    streamRanking.test.ts
    weeklyDigest.test.ts
supabase/functions/
  _shared/
    appEvents.ts
    upstreamLedger.ts
  audio-proxy/index.ts
  lastfm-auth/index.ts
  lastfm-scrobble/index.ts
  listener-ping/index.ts
  song-artwork/index.ts
  song-ingest/index.ts
  song-play/index.ts
  song-refresh/index.ts
  stream-telemetry/index.ts
  weekly-digest/index.ts
  xml-proxy/index.ts
```

## Documentation

- [Architecture and data flow](docs/architecture.md)
- [Cracktro mode notes](docs/cracktro.md)
- [Goose learning design](docs/goose-learning.md)

## How it works

### XML data flow

1. `src/pages/Index.tsx` refreshes `queue`, `oneliner`, `online`, and `streams` on separate intervals.
2. When the tab is hidden, polling pauses entirely unless audio is actively playing; in that case only `queue` is refreshed to keep track metadata, Media Session data, and scrobbling in sync.
3. `src/lib/nectarine.ts` fetches via `${VITE_SUPABASE_URL}/functions/v1/xml-proxy?path=...`.
4. `supabase/functions/xml-proxy/index.ts` validates allowed paths (`queue`, `oneliner`, `online`, `streams`, plus entity lookups like `song/{id}`) and fetches upstream Demovibes XML.
5. XML is parsed into playlist, oneliner, online user, and stream data for the UI panels.

### Audio streaming flow

1. `AudioPlayer` ranks playable streams with `src/lib/streamRanking.ts`, combining bitrate hints with cached reliability data from Supabase.
2. HTTPS streams are played directly when possible; mixed-content HTTP streams are wrapped through `${VITE_SUPABASE_URL}/functions/v1/audio-proxy?url=...`.
3. `audio-proxy` enforces an allowlisted host set and forwards `Range` requests for resume / seek behaviour.
4. Desktop playback can attach MSE buffering (`src/lib/bufferedStream.ts`) and an `AnalyserNode`; mobile intentionally skips that path so background playback survives better on iOS / Android.
5. Player logic handles retries, failover, live-edge correction, Media Session metadata, and visibility / focus / network-change recovery.
6. If stream metadata provides a now-playing endpoint, `src/lib/nowPlaying.ts` parses the station payload and refreshes it on the configured interval.

### Song metadata, artwork, and analytics

- `src/lib/entityCache.ts` resolves song metadata DB-first through `song-refresh`, then falls back to XML + background ingest when needed.
- `src/lib/songLog.ts` logs station plays to `song-play` and sends already-fetched song XML to `song-ingest` for enrichment.
- `src/components/SongLinks.tsx` surfaces stored links such as ModArchive / Demozoo / Pouet / YouTube when they exist.
- `src/lib/songArtwork.ts` and `supabase/functions/song-artwork/index.ts` resolve Nectarine screenshot pages into PNG-safe Media Session artwork URLs and cache them locally.
- `src/lib/streamTelemetry.ts` batches anonymous playback events, while `src/lib/listenerPing.ts` records a once-per-day listener ping for weekly listener stats.

### Visualizer reactivity & adaptive quality

- `src/lib/reactivitySettings.ts` defines the tunable model: global frequency band ranges (bass / low-mid / mid / treble in Hz), beat/sparkle thresholds, master intensity, and per-visualizer overrides. Settings are consumed through a small store and persisted to `localStorage` under `demo.reactivity.v1`.
- `src/components/ReactivityDrawer.tsx` renders the tuning UI on both the main page and cracktro mode, with reset-to-defaults at the global and per-mode level.
- `src/components/Visualizer.tsx` reads the live settings each frame and drives the seven visualizer modes from analyser data.
- An adaptive quality monitor tracks smoothed FPS and automatically steps the renderer between `high` / `medium` / `low` tiers (star / particle / comet / sparkle counts, DPR cap, glow multiplier, tunnel complexity). Firefox starts one tier down and disables `shadowBlur`.
- Starfield mode adds audio-reactive comets and treble-triggered sparkle bursts; the other modes expose their own per-mode effect controls in the reactivity drawer.

### Cracktro mode

`src/components/Cracktro.tsx` opens an in-page cracktro scene that can optionally enter browser fullscreen. Current scene includes:

- visualizer backdrop
- beat overlay
- sinus / bouncy / zoomer / wobble / copper / vector scroller
- bottom-pinned song info bar
- draggable panels for oneliner / online / queue / history / LAST.FM / goose roster / diagnostics
- flying geese, goose family simulation, optional procreation, and a resettable roster
- boing ball and tutorial hints
- goose platform banter (Amiga / Atari) on track change
- periodic “Have you seen Rapture?” routine every 10 minutes
- goose reaction when Rapture posts in oneliner

Most cracktro toggles persist in `localStorage`.

### Local phrase learning

`src/lib/gooseLearnedPhrases.ts` stores safe short phrases from oneliners in browser `localStorage`, tracks frequency/recency/users, and provides weighted picks plus emphatic trigger detection.

`src/lib/gooseLearnedLexicon.ts` extends this with a deterministic token/category/mood lexicon so goose chatter can recombine short learned snippets without pulling in an AI service.

## Setup

### Prerequisites

- Node.js 18+
- npm (the checked-in scripts below use npm; Bun lockfiles are also present if you prefer Bun)

### Install

```bash
npm install
```

### Environment

Create `.env` for the frontend Vite app:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Notes:

- The local `.env` also includes `VITE_SUPABASE_PROJECT_ID`, but the current frontend code does not read it.
- Do **not** commit real keys or URLs.

Supabase Edge Functions additionally rely on these server-side secrets:

- `SUPABASE_URL` — required by the DB-backed functions
- `SUPABASE_SERVICE_ROLE_KEY` — required by the DB-backed functions
- `LASTFM_API_KEY` / `LASTFM_API_SECRET` — required by `lastfm-auth` and `lastfm-scrobble`
- `DIGEST_CRON_SECRET` — used by `weekly-digest` production authorization and by `listener-ping` when salting weekly network hashes (with a fallback if unset)
- `DIGEST_RECIPIENT_EMAIL` — required to actually send weekly digests
- `LOVABLE_API_KEY` / `GOOGLE_MAIL_API_KEY` — required for `weekly-digest` email delivery through the linked Gmail connection

## Local development

Start the dev server:

```bash
npm run dev
```

Build the production bundle:

```bash
npm run build
```

Build with Vite's development mode:

```bash
npm run build:dev
```

Preview the built app locally:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

## Supabase edge functions

### `xml-proxy`

- file: `supabase/functions/xml-proxy/index.ts`
- allowlists Demovibes XML paths for `queue`, `oneliner`, `online`, `streams`, and entity lookups
- rejects invalid paths / traversal attempts
- proxies XML from `https://scenestream.net/demovibes/xml/...`
- records upstream fetch outcomes in the shared ledger

### `audio-proxy`

- file: `supabase/functions/audio-proxy/index.ts`
- proxies stream audio from an allowlisted host set
- accepts `GET`, `HEAD`, and `OPTIONS`
- forwards `Range` for streaming / resume behaviour
- exposes the streaming headers the browser needs and disables caching

### `song-artwork`

- file: `supabase/functions/song-artwork/index.ts`
- fetches the Demovibes song page, follows its screenshot link, and finds the actual screenshot image
- rewrites the image through `wsrv.nl` as a static PNG so Media Session artwork works on iOS
- returns `{ songId, screenshotId, screenshotUrl }` with a 1-hour cache header

### `lastfm-auth`

- file: `supabase/functions/lastfm-auth/index.ts`
- returns the configured public Last.fm API key to the frontend so login URLs and signed server calls stay aligned
- provides a diagnostic mode that returns key metadata without exposing secrets
- exchanges a Last.fm auth token for a session key / username pair
- records successful logins in the shared app-events table

### `lastfm-scrobble`

- file: `supabase/functions/lastfm-scrobble/index.ts`
- handles `nowplaying`, `scrobble`, `love`, and `unlove` signed Last.fm calls
- also supports unsigned `getinfo` requests so the UI can show whether the current track is already loved
- records successful love / unlove actions in the shared app-events table

### `song-play`

- file: `supabase/functions/song-play/index.ts`
- write-only sink for station play history
- deduplicates rows on `(song_id, playstart)` so many listeners can report the same track safely
- quietly ignores malformed or out-of-range payloads instead of breaking playback

### `song-ingest`

- file: `supabase/functions/song-ingest/index.ts`
- stores song metadata, artists, groups, tags, and external links from already-fetched song XML
- rate-limits enrichment per song with a 6-hour TTL
- deletes and re-inserts child rows so upstream removals propagate cleanly
- synthesizes Pouet / YouTube links when the XML provides those IDs but not a link row

### `song-refresh`

- file: `supabase/functions/song-refresh/index.ts`
- acts as the server-side freshness authority for song metadata
- serves cached song rows when fresh, with a shorter TTL for the currently playing song (45 min) and a longer one for background lookups (6 h)
- takes a short refresh claim so concurrent listeners collapse into one upstream song fetch
- fetches and ingests upstream song XML server-side when a row is missing or stale

### `stream-telemetry`

- file: `supabase/functions/stream-telemetry/index.ts`
- accepts batched anonymous playback events such as `connect_ok`, `error`, `stall`, `recovered`, `failover`, `switch`, `connection_change`, and `live_seek`
- writes them to `stream_events` with service-role access
- probabilistically prunes rows older than 90 days

### `listener-ping`

- file: `supabase/functions/listener-ping/index.ts`
- records a once-per-browser, once-per-Stockholm-day listener ping for weekly listener counts
- stores country plus a weekly-salted hash of IP + user agent instead of the raw IP
- always returns 200 so playback never depends on it succeeding

### `weekly-digest`

- file: `supabase/functions/weekly-digest/index.ts`
- compiles weekly plays, loves, logins, listener counts, country breakdowns, and trend data from Supabase
- sends the digest email to the configured owner via the linked Gmail connector
- supports a cron-secret-protected production path and a public-but-rate-limited test path used by the diagnostics panel

## Optional per-station now-playing metadata

If stream XML includes station metadata, add optional fields on `<stream>`:

- `nowPlayingUrl` (or `nowplaying_url`)
- `nowPlayingFormat` (currently `azuracast`)
- `nowPlayingIntervalMs` (default handled in player)
- `artworkUrl` (or `logo`)

Example:

```xml
<stream
  name="My Station"
  url="https://example.com/stream"
  nowPlayingUrl="https://example.com/api/nowplaying/station"
  nowPlayingFormat="azuracast"
  nowPlayingIntervalMs="20000"
  artworkUrl="https://example.com/logo.png"
/>
```

## Testing

- Main tests live under `src/test/`
- Current coverage includes cracktro defaults / fullscreen behaviour, flying goose layout + eggs, goose behaviour / social flows / lifecycle / trigger reactions / learned phrases / learned lexicon / Rapture events, Junebula colour rotation, now-playing parsing, oneliner reactions, smiley rendering, song artwork caching, stream ranking, and weekly digest helpers

Run all tests:

```bash
npm run test
```

Run Vitest in watch mode:

```bash
npm run test:watch
```

## Future ideas

- Expand event-driven cracktro moments (BPM-locked visuals, queue transitions, panel choreography)
- Add panel presets for streamers / recordings / mobile
- Tie more goose mood / energy changes to BPM confidence and session duration
- Add more digest / telemetry views for long-term stream reliability trends

## Credits / license

- Data source: Nectarine / Demovibes ecosystem
- License: _TBD (no `LICENSE` file is currently present in the repository)_
