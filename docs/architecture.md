# Architecture and data flow

## App entry and main page

- Entry route renders `src/pages/Index.tsx`.
- `Index` owns the main state for playlist, oneliners, online users, streams, UI toggles, visualizer style, and cracktro mode.
- Endpoints refresh on separate intervals — `queue` and `oneliner` every 30s, `online` every 10 minutes, `streams` every 60 minutes (`REFRESH_INTERVAL_MS`). While hidden but playing only `queue` refreshes; while hidden and paused nothing does. A track-end scheduler also refreshes `queue` when the current track is due to finish, with an escalating retry backoff.

## XML fetch path (`xml-proxy`)

1. `Index.tsx` calls `fetchEndpoint()` from `src/lib/nectarine.ts`.
2. `fetchEndpoint()` requests `${VITE_SUPABASE_URL}/functions/v1/xml-proxy?path=<endpoint>`.
3. `supabase/functions/xml-proxy/index.ts`:
   - validates `path` characters and blocks traversal
   - allowlists endpoint prefixes (`queue`, `oneliner`, `online`, `streams`, plus entity paths)
   - fetches upstream XML from `https://scenestream.net/demovibes/xml/${path}/`
4. `nectarine.ts` parses XML into typed data:
   - `parsePlaylist`
   - `parseOneliners`
   - `parseOnline`
   - `parseStreams`

## Audio playback path (`audio-proxy`)

1. `src/components/AudioPlayer.tsx` receives `streams` and track info.
2. Selected stream URL is wrapped through:
   `${VITE_SUPABASE_URL}/functions/v1/audio-proxy?url=<streamUrl>`.
3. `supabase/functions/audio-proxy/index.ts`:
   - validates URL + protocol
   - checks hostname against allowlisted stream hosts
   - forwards optional `Range` header
   - returns proxied stream body with CORS + exposed streaming headers
4. `AudioPlayer` handles:
   - retry delays and max retries
   - failover to other playable streams
   - optional MSE buffering via `src/lib/bufferedStream.ts` (desktop only — disabled on mobile so the OS media stack handles background buffering)
   - AudioContext/AnalyserNode hookup for visualizers + BPM (desktop only — skipped on mobile so iOS/Android keep playing when backgrounded)
   - background-resume watchdog on `visibilitychange` / `pageshow` / `online` / `focus`
   - Media Session metadata updates and optional station now-playing polling
   - Last.fm now-playing + scrobble on track change (30–1800s of actual playback) and via a 240s interval, with paused time excluded; a `pagehide` flush catches the final track of a session; auth failures clear the session and surface a reconnect banner

## Visualizer, BPM, and beat overlay

- `AudioPlayer` exposes an `AnalyserNode` to `Index`.
- `Visualizer` renders style-specific visuals from analyser data.
- `useBpm` (from `Visualizer.tsx`) derives beat timing and BPM status.
- `BeatOverlay` uses analyser activity for reactive overlays.
- Both normal page mode and cracktro mode share this analyser-driven signal path.

## Cracktro composition

`src/components/Cracktro.tsx` composes a fullscreen scene with:

- `Visualizer` background
- `BeatOverlay`
- scroller canvas (multiple scroll modes)
- optional song info bar
- optional `FlyingGoose` actors
- optional `BoingBall`
- draggable `FloatingWindow` panels for oneliner/online/queue/history/roster/diag/lastfm

Cracktro starts windowed, supports enter/exit fullscreen button flow, and keeps a fallback non-fullscreen layout if fullscreen is denied.

## Browser persistence (`localStorage`)

Main examples:

- `Index.tsx`
  - theme (`nectarine-theme`)
  - scanlines (`nectarine-scanlines`)
  - visualizer style (`nectarine-viz`)
  - font scale (`nectarine-font-scale`)
  - panel open/expanded flags
- `Cracktro.tsx`
  - scroller mode + toggles
  - infobar toggle
  - floating panel visibility map
  - skin override
  - goose / brown goose / boing toggles
- `gooseLearnedPhrases.ts`
  - learned phrase memory (`goose-learned-phrases`)
- `gooseLearnedLexicon.ts`
  - proposed token lexicon memory (`goose-learned-lexicon-v1`)

## Song database and telemetry

Tables `songs` (+ `song_artists`, `song_groups`, `song_tags`, `song_links`), `song_plays`, `stream_events`, `upstream_fetches`. Views `song_search`, `song_play_counts`, `song_last_played`, `stream_reliability`, `upstream_fetch_stats`. All tables RLS-protected with SELECT-only policies; every write goes through a service-role edge function.

- `song-play` — one row per track change, deduplicated by a unique `(song_id, playstart)` constraint so concurrent listeners cannot inflate counts. `playstart` is passed through as the raw upstream string so all clients agree on the value.
- `song-ingest` — writes parsed song detail, piggybacking on XML the client already fetched, so it adds no upstream requests.
- `song-refresh` — owns freshness. Returns the DB row and only fetches upstream when stale, using `refresh_claimed_at` so concurrent clients produce one request. TTL 45 min for the currently-playing track, 6 h otherwise.
- `stream-telemetry` — playback events (errors, stalls, handovers, live seeks, play rejections). Requires `verify_jwt = false` because it flushes via `sendBeacon`. Prunes rows older than 90 days.

`entityCache` reads songs DB-first via PostgREST (an embedded query, not a function invocation), falling back to the XML path when a song is absent. This replaced a 2-minute per-client TTL and is the main reason upstream traffic fell from roughly 890 to 130 requests/hour per open tab.

Stream ordering (`streamRanking.ts`): 192 kbps first, then descending bitrate, with genuinely dead streams demoted. Failure counts collapse retry storms into incidents, net out recoveries, exclude the audio-proxy's ~402s connection cut, and rehabilitate a stream after 3 clean days.

## Themes

Ten themes are driven by CSS custom properties on `[data-theme]`. `juN3bula` is the exception — `src/lib/junebula.ts` computes the day's colour from ISO week parity and weekday, and `Index.tsx` applies it as inline custom properties, refreshing every 60s and on tab focus.

## Notable files and responsibilities

- `src/pages/Index.tsx` — main orchestration UI + endpoint refresh
- `src/components/AudioPlayer.tsx` — stream playback, retry/failover, media session, now-playing polling
- `src/components/Cracktro.tsx` — fullscreen cracktro scene and controls
- `src/components/Visualizer.tsx` — analyser-driven visualizers + BPM logic
- `src/components/LoveButton.tsx` — Last.fm love/unlove button
- `src/lib/nectarine.ts` — XML proxy client, XML parsing, formatting/link helpers
- `src/lib/entityCache.ts` — DB-first song resolution and XML fallback
- `src/lib/junebula.ts` — 14-day rotating colour system
- `src/lib/lastfm.ts` — Last.fm session, now-playing, scrobble, love
- `src/lib/onelinerReactions.ts` — deterministic regex-based reaction detection
- `src/lib/songLog.ts` — fire-and-forget play logging and song ingest triggers
- `src/lib/streamRanking.ts` — stream ordering and reliability-based demotion
- `src/lib/streamTelemetry.ts` — anonymous stream event batching and reliability view
- `src/lib/gooseLearnedPhrases.ts` — current phrase-level learning
- `src/lib/gooseLearnedLexicon.ts` — new rule-based token lexicon design
- `supabase/functions/xml-proxy/index.ts` — safe XML proxy
- `supabase/functions/audio-proxy/index.ts` — safe audio proxy with host allowlist
- `supabase/functions/song-play/index.ts` — write-only play logging
- `supabase/functions/song-ingest/index.ts` — song metadata enrichment
- `supabase/functions/song-refresh/index.ts` — server-side freshness and upstream claim coordination
- `supabase/functions/stream-telemetry/index.ts` — anonymous playback telemetry sink
