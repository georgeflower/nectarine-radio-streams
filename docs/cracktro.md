# Cracktro mode

Cracktro mode is the app's demoscene scene-layer: a fullscreen-capable, effect-heavy presentation shell over live radio data.

## 1) Purpose

Cracktro provides an immersive viewing/listening mode while retaining core station context:

- current song metadata
- oneliner feed
- online users
- queue/history visibility

It is designed as a reactive "scene" rather than a static alternate page layout.

## 2) Scene composition

Current scene elements include:

- visualizer backdrop
- beat-reactive overlay
- optional scroller with multiple movement styles
- optional now-playing info bar
- optional flying geese (white and brown variants)
- optional boing ball
- draggable floating windows for live data and diagnostics

The scene is launched from the main page and can stay windowed or switch to browser fullscreen.

## 3) Window and fullscreen model

- default entry is in-page/windowed scene mode
- user may request browser fullscreen
- if fullscreen request is denied, cracktro remains usable in non-fullscreen fallback layout
- exiting fullscreen preserves scene state and restores surrounding UI context

## 4) Interaction controls

Cracktro exposes user controls for:

- scroller enable + mode selection
- skin/font override settings
- info bar visibility
- goose/boing toggles
- floating panel visibility
- visualizer effect selection and related display behavior

Controls are designed for real-time toggling while playback continues.

## 5) Floating panel system

Typical cracktro panels:

- oneliner
- online users
- up next queue
- recent history
- diagnostics
- Last.fm status/actions
- goose roster/family state (when enabled)

Panels are draggable and can be hidden/shown independently to support different viewing styles.

## 6) Persistence behavior

Cracktro preferences are persisted in browser local storage so scene state survives reloads:

- enabled visual extras
- panel visibility map
- selected scroller mode
- skin override and related preferences

This keeps cracktro behavior consistent across sessions on the same browser/device.

## 7) Event-driven behavior currently present

- track-change-triggered goose banter variants
- periodic "Have you seen Rapture?" routine
- oneliner-triggered goose reaction flows

These routines are deterministic and integrated with existing goose/reaction systems.

## 8) Performance considerations

Cracktro intentionally shares rendering/audio-analysis systems with the main visualizer path.

Practical implications:

- quality tiering and analyzer costs affect scene smoothness
- lower-power devices may require simpler effect combinations
- panel count and overlay intensity can materially change FPS

For diagnostics, use the in-app performance tips and diagnostics panel while testing cracktro-heavy setups.

## 9) Extension guidance

When expanding cracktro, preserve these invariants:

1. playback resilience first (never gate audio on visual extras)
2. toggles should be independently controllable
3. all new scene features need safe defaults
4. persisted keys must be versionable and migration-aware
5. avoid introducing behavior that breaks hidden-tab/background playback assumptions

## 10) Candidate expansion directions

- stronger queue-transition scene stingers
- BPM confidence profiles that alter animation intensity
- timed panel choreography presets
- additional sprite actors with bounded CPU budgets
- user-selectable cracktro presets for mobile vs desktop
