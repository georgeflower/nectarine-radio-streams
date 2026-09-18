# Architecture and data flow

This document describes the current runtime structure, data paths, and backend responsibilities in `nectarine-radio-streams`.

## 1) Runtime topology

### Frontend

- Vite + React + TypeScript SPA
- Main route orchestration in `src/pages/Index.tsx`
- Playback core in `src/components/AudioPlayer.tsx`
- Visual and scene systems in `src/components/Visualizer.tsx` and `src/components/Cracktro.tsx`

### Backend (Supabase Edge Functions)

- request brokering/proxy: `xml-proxy`, `audio-proxy`
- metadata lifecycle: `song-refresh`, `song-ingest`, `song-play`, `song-artwork`
- social/analytics: `lastfm-auth`, `lastfm-scrobble`, `stream-telemetry`, `listener-ping`, `weekly-digest`

## 2) UI orchestration and refresh model

`Index.tsx` owns high-level state and timed updates for the main XML feeds.

Refresh policy:

- `queue`: every 30s
- `oneliner`: every 30s
- `online`: every 10 minutes
- `streams`: every 60 minutes

Visibility behavior:

- hidden + paused: polling stops
- hidden + playing: queue-only refresh continues

This balances freshness with reduced background network usage.

## 3) XML fetch and parse path

1. UI requests endpoint data via `src/lib/nectarine.ts`.
2. Client calls `${VITE_SUPABASE_URL}/functions/v1/xml-proxy?path=...`.
3. `xml-proxy` validates path syntax and allowlisted endpoint prefixes.
4. Function fetches upstream Demovibes XML.
5. Client parses XML into typed structures (`playlist`, `oneliners`, `online`, `streams`).

Security and resilience traits:

- traversal-resistant path validation
- fixed upstream host base
- no direct browser fetch to upstream XML endpoints

## 4) Audio playback and failover path

1. `AudioPlayer` receives stream list and current track state.
2. Stream candidates are sorted by `streamRanking.ts`.
3. Direct HTTPS playback is preferred where possible.
4. Mixed-content/incompatible URLs can route through `audio-proxy`.
5. Player handles retries, failover, recovery, and telemetry hooks.

`audio-proxy` behavior:

- host allowlist enforcement
- protocol and URL validation
- supports `GET`, `HEAD`, `OPTIONS`
- forwards range semantics and required stream headers

## 5) Analyzer, BPM, and visual signal chain

- `AudioPlayer` creates/updates analyser context for visual systems
- `Visualizer` consumes analyser bins for mode-specific drawing
- beat/BPM data powers overlays and reactive effects
- cracktro mode reuses the same signal pipeline rather than forking audio analysis

Adaptive quality:

- monitors frame rate health
- steps renderer complexity between `high`/`medium`/`low`
- includes browser-specific guardrails (notably for Firefox behavior)

## 6) Song metadata and caching lifecycle

Main actors:

- `entityCache.ts` (frontend cache facade)
- `song-refresh` (freshness authority)
- `song-ingest` (metadata population)
- `song-play` (event sink)
- `song-artwork` (lockscreen art URL derivation)

Typical flow:

1. UI needs song details.
2. `entityCache` attempts DB-backed path first.
3. stale/missing entries trigger refresh behavior.
4. ingest path stores normalized song metadata and link surfaces.
5. song play transitions are recorded independently.

Design goals:

- reduce repeated upstream fetches
- centralize freshness policy server-side
- tolerate malformed payloads without breaking playback UX

## 7) Social + telemetry + digest path

### Last.fm

- `lastfm-auth`: key/session exchange and auth-related diagnostics
- `lastfm-scrobble`: nowplaying/scrobble/love/unlove operations

### Telemetry

- `stream-telemetry`: batched anonymous playback event writes
- `listener-ping`: daily listener-day tracking primitive with salted network hashing

### Weekly digest

- `weekly-digest`: compiles weekly stats and sends owner email report
- supports production trigger controls and test mode constraints

## 8) Persistence model (browser)

The app uses local storage for user-facing UX continuity, including:

- theme and display preferences
- visualizer/cracktro toggles
- floating panel visibility states
- goose phrase/lexicon learning data
- selected quality/interaction tuning values

Persistence is intentionally local-browser scoped and does not require user login.

## 9) Database and access boundaries

Schema includes song and telemetry/event-oriented tables plus helper views for reliability/reporting.

Access principles:

- table policies are restrictive
- direct writes from untrusted clients are avoided
- mutation paths primarily flow through service-role Edge Functions

## 10) Failure strategy and non-blocking behavior

Key architecture principle: media playback should survive peripheral failures.

Therefore:

- analytics writes are fire-and-forget
- listener ping path always resolves safely
- metadata enrichments degrade gracefully
- retry/failover paths protect active listening sessions

## 11) Files to read first when modifying architecture

- `src/pages/Index.tsx`
- `src/components/AudioPlayer.tsx`
- `src/components/Visualizer.tsx`
- `src/components/Cracktro.tsx`
- `src/lib/nectarine.ts`
- `src/lib/entityCache.ts`
- `src/lib/streamRanking.ts`
- `src/lib/streamTelemetry.ts`
- `supabase/functions/*/index.ts`
