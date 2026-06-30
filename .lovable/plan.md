## Problem

Playback dies in the background on mobile — fast on iOS (~6–10 min), occasionally on Android (~30 min). Returning to the tab resumes it. Two design choices in `AudioPlayer.tsx` cause this:

1. **Web Audio routing of the `<audio>` element.** `ensureAudioGraph()` calls `ctx.createMediaElementSource(audio)` and connects through an `AnalyserNode` to `ctx.destination`. On iOS Safari this reclassifies the stream as Web Audio output, which the OS does **not** treat as background-eligible media. When the tab/app goes to background, the `AudioContext` is suspended by the OS and audio stops within minutes. This matches the 6–10 minute iOS symptom exactly.
2. **MSE buffered stream (`attachBufferedStream`).** When MSE is supported (Android Chrome), we feed the `<audio>` element from `SourceBuffer`s driven by `fetch()` + JS timers. Background tabs throttle timers and fetch, so the buffer drains and playback halts — matches the “sometimes after ~30 min on Android” symptom.

Both paths also lack a visibility/`pageshow`/MediaSession watchdog that re-kicks playback when the device returns.

## Fix

Make background playback the default and only enable the “fancy” pipeline when the page is actually visible.

### 1. Decouple Web Audio analyser from background playback (`src/components/AudioPlayer.tsx`)
- Do not create the `MediaElementSource`/Analyser graph until a visualizer actually needs it. Gate `ensureAudioGraph()` behind a new prop `enableAnalyser` (default `false`) and only set it to `true` from `Index.tsx` / `Cracktro.tsx` when a visualizer is mounted.
- Once `MediaElementSource` exists, the element is permanently routed through Web Audio (cannot be undone). So when analyser is enabled, additionally:
  - `audio.setAttribute("playsinline", "")` and ensure `controls` are not set.
  - Add a `visibilitychange` listener: when `document.hidden`, call `audioCtx.suspend()` is **wrong** (kills audio). Instead, do **not** suspend; keep the context running. On `pagehide`/`hidden` start a short watchdog (see step 3).
- Provide a "background-safe" mode: when `enableAnalyser` is false, never call `createMediaElementSource`, so the element plays as plain HTML5 media → iOS keeps it alive in lockscreen/background indefinitely.

### 2. Disable MSE buffered stream on mobile / when hidden
- In `playUrl`, only use `attachBufferedStream` when `!isMobile() && document.visibilityState === "visible"`. For mobile or background, set `audio.src = proxiedUrl(url)` directly so the browser's native media stack handles buffering (it keeps running in the background).
- Add `isMobile()` helper (UA + coarse pointer check).
- Tear down any existing buffered stream before switching modes.

### 3. Background watchdog + auto-resume
- Add listeners for `visibilitychange`, `pageshow`, and `online`. When the page becomes visible again and `shouldPlayRef.current` is true but `audio.paused` or `audio.readyState < 2`, call `attemptRecovery()` to reload the stream with a cache-bust.
- Also wire `navigator.mediaSession.setActionHandler("play", …)` already exists — additionally call `mediaSession.playbackState = "playing"` aggressively after successful `onPlaying` so lockscreen controls stay valid for longer on iOS.
- Increase `STALL_TIMEOUT_MS` handling so background stalls don't fire false errors; pause the stall timer while `document.hidden` and restart on visibility.

### 4. Keep wake lock behaviour
- `useWakeLock` only holds the screen on; it doesn't help background audio. Leave it untouched.

## Files touched

- `src/components/AudioPlayer.tsx` — new `enableAnalyser` prop, gate Web Audio + MSE, add visibility/pageshow watchdog, pause stall timer while hidden.
- `src/pages/Index.tsx` — pass `enableAnalyser={visualizerVisible}` (true when a visualizer panel is shown).
- `src/components/Cracktro.tsx` — pass `enableAnalyser` true (cracktro always uses visualizer) — confirm the existing analyser flow still works.
- (Optional) small `isMobile()` helper in `src/lib/utils.ts`.

## Notes / trade-offs

- On mobile, when a visualizer is on screen and the user backgrounds the app, iOS may still kill audio after a few minutes — this is unavoidable while Web Audio is in the chain. Mitigation: visualizers stay off by default on mobile, or we add a “Background audio (disables visualizer)” toggle.
- Direct `<audio>` playback loses the in-app buffer indicator (`bufferedAhead`) for the MSE path on mobile; that's acceptable for background reliability.
- No backend changes; `audio-proxy` is unchanged.

## Verification

- Foreground desktop: visualizer + BPM still react, scrobble still fires.
- Mobile foreground: audio plays, lockscreen metadata + artwork still appear.
- Mobile background (screen off / app switched): audio continues for >30 min on both iOS and Android.
- Returning to foreground after a network drop: watchdog re-kicks within a few seconds without user tap.
