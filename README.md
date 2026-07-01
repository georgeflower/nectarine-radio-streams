# Nectarine Radio Streams

A retro-styled Nectarine / Demovibes radio client built with React + TypeScript.

This app combines live stream playback, Demovibes XML panels, visualizers, and a fullscreen cracktro scene with goose + boing ball extras.

## Features

- Live stream playback from Demovibes stream listings
- Stream retry + failover and optional MSE buffering for steadier playback
- Queue / now playing / history panels
- Infamous OneLiner + online users panels
- Multiple visualizer styles and beat overlay
- Fullscreen cracktro mode with floating windows, scroller, info bar, geese, and boing ball
- Cracktro settings organized into Visuals · Geese · Panels · More sections
- Main-page ⚙ Settings popover for scanlines, visualizer style, diagnostics and Last.fm
- Browser-local goose learning with phrase memory + lexicon-based chatter

- Goose social dialogue and scripted exchanges (Amiga/Atari banter, periodic routines, oneliner reactions)
- Mobile screen wake lock so the display stays active while listening
- OS lockscreen artwork (iOS / Android) via MediaSession — song screenshots with app-icon fallback
- Optional per-station now-playing metadata polling for Media Session metadata

## Tech stack

- Vite
- React 18
- TypeScript
- Tailwind CSS
- TanStack Query
- Supabase Edge Functions
- Vitest + Testing Library

## Project structure

```text
src/
  components/
    AudioPlayer.tsx
    BeatOverlay.tsx
    Cracktro.tsx
    FlyingGoose.tsx
    FloatingWindow.tsx
    Visualizer.tsx
  lib/
    nectarine.ts
    nowPlaying.ts
    bufferedStream.ts
    onelinerReactions.ts
    gooseLearnedPhrases.ts
    gooseLearnedLexicon.ts
  pages/
    Index.tsx
  test/
    *.test.ts(x)
supabase/functions/
  xml-proxy/index.ts
  audio-proxy/index.ts
  song-artwork/index.ts
```

## How it works

### XML data flow

1. `src/pages/Index.tsx` refreshes endpoint data on interval (`queue`, `oneliner`, `online`, `streams`).
2. `src/lib/nectarine.ts` fetches via `${VITE_SUPABASE_URL}/functions/v1/xml-proxy?path=...`.
3. `supabase/functions/xml-proxy/index.ts` validates allowed paths and fetches upstream Demovibes XML.
4. XML is parsed into playlist, oneliner, online user, and stream data for UI panels.

### Audio streaming flow

1. `AudioPlayer` selects playable stream data from `parseStreams`.
2. It plays through `${VITE_SUPABASE_URL}/functions/v1/audio-proxy?url=...`.
3. `audio-proxy` enforces allowed hosts and forwards headers/range requests.
4. Player logic handles retries, failover, analyser hookup, and Media Session metadata.
5. If stream metadata provides now-playing JSON, `src/lib/nowPlaying.ts` parses station payloads.

### Cracktro mode

`src/components/Cracktro.tsx` renders a fullscreen retro scene with:

- visualizer backdrop
- beat overlay
- sinus/bouncy/zoomer/wobble/copper/vector scroller
- song info bar
- draggable panels (oneliner / online / queue / history)
- flying geese + optional brown goose
- boing ball
- goose platform banter (Amiga / Atari) on track change
- periodic "Have you seen Rapture?" routine every 10 minutes
- goose reaction when Rapture posts in oneliner

Most cracktro toggles persist in `localStorage`.

### Local phrase learning

`src/lib/gooseLearnedPhrases.ts` stores safe short phrases from oneliners in browser `localStorage`, tracks frequency/recency/users, and provides weighted picks plus emphatic trigger detection.

`src/lib/gooseLearnedLexicon.ts` extends this idea to a token/category/mood lexicon system without AI, and goose chatter uses lexicon output as a short-form fallback before static lines.



## Setup

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Environment

Create `.env`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
```

## Local development

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

Run tests:

```bash
npm run test
```

Lint:

```bash
npm run lint
```

> Note: lint currently reports some pre-existing issues in UI helper files.

## Supabase edge functions

### `xml-proxy`

- file: `supabase/functions/xml-proxy/index.ts`
- allows specific Demovibes XML paths
- rejects invalid/disallowed paths
- returns XML with CORS headers

### `audio-proxy`

- file: `supabase/functions/audio-proxy/index.ts`
- proxies stream audio from an allowlisted host set
- forwards `Range` for streaming/seek behavior
- exposes relevant response headers for browser playback

### `song-artwork`

- file: `supabase/functions/song-artwork/index.ts`
- follows a screenshot link (`/demovibes/screenshot/{id}/`) if present on the song page — screenshot IDs are independent of song IDs
- returns the screenshot URL proxied through `wsrv.nl` as a static PNG so iOS MediaSession can render it
- client-side cache in `localStorage` with 24-hour TTL

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
- Existing suite covers cracktro defaults, goose behavior, oneliner reactions, now-playing parsing, and learned phrase behavior

Run all tests:

```bash
npm run test
```

## Future ideas

- Expand event-driven cracktro events (BPM-locked visuals, queue transitions)
- Wire the lexicon design deeper into goose chatter generation
- Add panel presets for streamers / recordings / mobile
- Goose mood and energy tied to BPM confidence and session duration

## Credits / license

- Data source: Nectarine / Demovibes ecosystem
- License: _TBD (add project license details)_
