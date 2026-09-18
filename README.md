# Nectarine Radio Streams

A demoscene-first web radio client for Nectarine / Demovibes, built with React + TypeScript + Supabase.

It combines resilient stream playback, live community panels (queue / oneliner / online users), analyser-driven visuals, cracktro mode, Last.fm integration, and optional backend analytics.

## Table of contents

- [What this project does](#what-this-project-does)
- [Feature map](#feature-map)
- [System overview](#system-overview)
- [Repository layout](#repository-layout)
- [Environment and secrets](#environment-and-secrets)
- [Local development](#local-development)
- [Supabase Edge Functions](#supabase-edge-functions)
- [Testing and quality checks](#testing-and-quality-checks)
- [Operational notes](#operational-notes)
- [Roadmap ideas](#roadmap-ideas)
- [Additional docs](#additional-docs)

## What this project does

This app consumes Demovibes XML feeds and audio streams, then presents them as a responsive radio UI with:

- station playback and automatic stream failover
- queue/history metadata presentation
- oneliner and online user feeds
- visual effects and cracktro overlays
- optional telemetry, listener counting, and weekly digest email reporting

## Feature map

### Playback and reliability

- Ranked stream selection (`192 kbps` preferred, then descending bitrate)
- Reliability-aware demotion of unstable stream URLs
- Retry and failover behavior in the player
- Live-edge recovery and reconnect watchdog logic
- Desktop buffering path via MSE (`bufferedStream.ts`) where supported
- Media Session metadata updates with lockscreen artwork fallback handling

### Data and metadata

- XML endpoint proxying through `xml-proxy` to avoid browser CORS problems
- DB-first song metadata resolution with fallback refresh/ingest pipeline
- Optional per-station now-playing endpoint polling
- Song link surfacing (ModArchive, Demozoo, Pouet, YouTube when available)

### Visual and UI systems

- Multiple visualizer styles (`off`, `starfield`, `bars`, `plasma`, `oscilloscope`, `tunnel`, `rings`, `particles`)
- Beat overlay and BPM-informed effects
- Adaptive rendering quality tiering (`high` / `medium` / `low`)
- Ten themes including dynamic `juN3bula`
- CRT/scanline/transparency/font-scale controls persisted in local storage

### Cracktro and goose systems

- Windowed cracktro scene with optional browser fullscreen
- Draggable floating windows (oneliner/online/queue/history/roster/diagnostics/Last.fm)
- Scroller modes, boing ball, and info bar toggles
- Goose chatter/reaction systems, roster/family simulation, and deterministic local learning

### Integrations and observability

- Last.fm auth + nowplaying + scrobble + love/unlove support
- Batched stream telemetry events to Supabase
- Daily listener ping for weekly listener estimations
- Weekly digest Edge Function for owner-facing activity email summaries

## System overview

### Frontend runtime

- Entry: `src/main.tsx`
- Primary route + orchestration: `src/pages/Index.tsx`
- Audio: `src/components/AudioPlayer.tsx`
- Visualizer + BPM behavior: `src/components/Visualizer.tsx`
- Cracktro scene: `src/components/Cracktro.tsx`

### Data flow (high level)

1. Frontend polls XML endpoint types (`queue`, `oneliner`, `online`, `streams`) on different intervals.
2. Requests go through Supabase `xml-proxy`.
3. Parsed results update panels and playback state.
4. Player chooses a stream, then direct-plays HTTPS URLs or proxies HTTP/mixed-content via `audio-proxy`.
5. Song metadata/logging/artwork paths call dedicated Edge Functions and cache data client-side.

## Repository layout

```text
src/
  components/      # UI and playback/visualizer/cracktro components
  hooks/           # shared hooks
  integrations/    # generated Supabase client/types glue
  lib/             # parsing, ranking, telemetry, goose systems, helpers
  pages/           # route-level pages
  test/            # Vitest suites
supabase/
  functions/       # Edge Functions (proxying, metadata, telemetry, digest)
  migrations/      # SQL schema and RLS/policy changes
docs/
  architecture.md
  cracktro.md
  goose-learning.md
```

## Environment and secrets

### Frontend `.env`

Required:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Notes:

- `VITE_SUPABASE_PROJECT_ID` may exist locally but is currently unused by frontend runtime code.
- Never commit real credentials.

### Supabase Edge Function secrets

Depending on function usage:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LASTFM_API_KEY`
- `LASTFM_API_SECRET`
- `DIGEST_CRON_SECRET`
- `DIGEST_RECIPIENT_EMAIL`
- `LOVABLE_API_KEY`
- `GOOGLE_MAIL_API_KEY`

## Local development

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

### Build and preview

```bash
npm run build
npm run preview
```

### Lint and tests

```bash
npm run lint
npm run test
```

## Supabase Edge Functions

- `xml-proxy` — allowlisted XML proxy for Demovibes endpoint paths
- `audio-proxy` — allowlisted stream proxy with range/header handling
- `song-refresh` — server-side song freshness authority + refresh claim
- `song-ingest` — metadata/link ingestion from song XML
- `song-play` — write-only play sink with dedup constraints
- `song-artwork` — screenshot URL extraction and static artwork rewriting
- `stream-telemetry` — batched playback telemetry sink
- `listener-ping` — daily listener-day/country tracking primitive
- `lastfm-auth` — Last.fm key/session auth exchange path
- `lastfm-scrobble` — nowplaying/scrobble/love/unlove requests
- `weekly-digest` — weekly owner digest generation and email delivery

## Testing and quality checks

- Test runner: Vitest + Testing Library (`src/test/`)
- Linting: ESLint (`eslint.config.js`)
- Main command set:
  - `npm run lint`
  - `npm run test`
  - `npm run test:watch`

Recommended for contributors before PRs:

1. run lint
2. run tests
3. manually verify playback + cracktro toggles in dev mode
4. ensure no secrets are introduced in edited files

## Operational notes

- Listener ping and telemetry are intentionally non-blocking so playback is never gated by analytics writes.
- XML/audio proxies enforce path/host restrictions; keep allowlists tight when extending.
- Weekly digest has separate production and test trigger behavior and should remain rate-limited/idempotent.
- `juN3bula` is time-driven; UI updates automatically on a timed cadence and visibility changes.

## Roadmap ideas

- richer cracktro event choreography tied to queue/BPM/session milestones
- additional stream reliability and telemetry visualization surfaces
- more contributor-facing automation around Supabase function validation

## Additional docs

- [Architecture and data flow](docs/architecture.md)
- [Cracktro mode notes](docs/cracktro.md)
- [Goose learning design](docs/goose-learning.md)
