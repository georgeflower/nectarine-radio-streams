# Architecture and data flow

## App entry and main page

- Entry route renders `src/pages/Index.tsx`.
- `Index` owns the main state for playlist, oneliners, online users, streams, UI toggles, visualizer style, and cracktro mode.
- `refreshAll()` runs on an interval (`AUTO_REFRESH_INTERVAL_MS`) and fetches all Demovibes XML endpoints in parallel.

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
   - Last.fm now-playing + scrobble (50% or 240s threshold) when a session is connected

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
- draggable `FloatingWindow` panels for oneliner/online/queue/history

Cracktro auto-requests fullscreen on mount, supports enter/exit button flow, and keeps a fallback non-fullscreen layout if fullscreen is denied.

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

## Notable files and responsibilities

- `src/pages/Index.tsx` — main orchestration UI + endpoint refresh
- `src/components/AudioPlayer.tsx` — stream playback, retry/failover, media session, now-playing polling
- `src/components/Cracktro.tsx` — fullscreen cracktro scene and controls
- `src/components/Visualizer.tsx` — analyser-driven visualizers + BPM logic
- `src/lib/nectarine.ts` — XML proxy client, XML parsing, formatting/link helpers
- `src/lib/onelinerReactions.ts` — deterministic regex-based reaction detection
- `src/lib/gooseLearnedPhrases.ts` — current phrase-level learning
- `src/lib/gooseLearnedLexicon.ts` — new rule-based token lexicon design
- `supabase/functions/xml-proxy/index.ts` — safe XML proxy
- `supabase/functions/audio-proxy/index.ts` — safe audio proxy with host allowlist
