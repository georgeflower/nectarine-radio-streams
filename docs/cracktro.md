# Cracktro mode

## What cracktro mode is today

Cracktro mode is a fullscreen retro scene launched from the main page. It overlays the app with a demoscene-inspired presentation while keeping live Nectarine stream data visible through floating windows.

## Scene composition

Current scene includes:

- analyser-driven visualizer backdrop
- beat overlay flashes/reactivity
- optional animated text scroller with selectable modes:
  - sinus
  - bouncy
  - zoomer
  - wobble
  - copper
  - vector
- optional now-playing info bar (title/artist/platform/rating)
- optional flying white goose
- optional flying brown goose
- optional boing ball
- goose platform banter (Amiga / Atari) on track change
- periodic "Have you seen Rapture?" routine every 10 minutes
- goose reaction when Rapture posts in oneliner
- floating draggable panels for:
  - oneliner
  - online users
  - up next queue
  - recent history

## Current controls and persistence

Cracktro settings bar provides toggles for:

- scroller on/off + mode
- font/skin override
- info bar on/off
- goose, brown goose, boing ball
- floating panel visibility
- visualizer effect selection

Visibility and preferences are persisted in `localStorage` so scene state survives page reloads.

## Dynamic expansion ideas (long-term)

- **Session phases**: evolve visuals as listening time increases (warmup → peak → late-night).
- **Palette drift**: subtle hue transitions tied to BPM confidence and track changes.
- **Panel choreography**: optional auto-layouts that reposition floating windows based on activity.
- **Goose troupe events**: periodic scripted moments (flyby, sync dance, “greetz parade”).
- **Milestone badges**: unlock cosmetic scene modifiers after oneliner/queue/session milestones.

## Event-driven ideas

### Oneliner-driven

- trigger short visual stingers from reaction classes (heart/laughter/wink)
- use lexicon mood (`friendly`, `hype`, etc.) to switch scroller style profile
- map emphatic punctuation bursts to temporary overlay intensity boosts

### BPM-driven

- when BPM is locked, enable stronger beat-synced flashes and timed sprite movements
- when BPM confidence drops, fall back to calmer animation profile

### Queue-change driven

- detect now-playing transition and run short scene transition animation
- theme modifiers for genre/platform heuristics from metadata

### Online-user driven

- when online count spikes, temporarily open/animate online panel
- optional “crowd mode” visual layer based on active user thresholds

### Session-duration driven

- every N minutes unlock one extra active element (new sprite, overlay, panel style)
- progressive wear/patina effects for oldschool monitor vibe over long sessions
