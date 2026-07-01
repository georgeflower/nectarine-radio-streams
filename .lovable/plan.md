## Plan: detailed reconnect logging in AudioPlayer

Add focused, structured console logging inside `src/components/AudioPlayer.tsx` (and a small helper in `src/lib/playbackWatchdog.ts`) so every reconnect/stall/resume on iOS and Android is traceable. No behavior changes — logging only.

### 1. Logger helper (in `playbackWatchdog.ts`)

- Add `logPlayback(category, message, data?)` that:
  - Prefixes entries with `[AudioPlayer]` + platform (`ios`/`android`/`desktop`) + ISO timestamp.
  - Uses `console.info` for resume/visibility, `console.warn` for stalls/reconnects, `console.error` for failures.
  - Includes a monotonically increasing event id so consecutive entries can be correlated on mobile remote debuggers.
- Add a small ring buffer (last 100 entries) exposed via `getPlaybackLog()` so the existing diagnostics panel could surface it later (no UI change in this plan).

### 2. AudioPlayer event logging

Instrument every code path that can drop or restart the stream. Each log includes a snapshot: `{ url, target, currentTime, readyState, paused, hidden, sinceProgressMs, sinceLoadMs, retryCount, mode }`.

- **playUrl**
  - Log on entry: requested url, cacheBust flag, chosen target, chosen mode (`mse` / `bypass` / `webaudio`), same-src fast-path hits.
  - Log resolved `play()` success and any non-AbortError failure.
- **attemptRecovery**
  - Log entry reason, current retry count, mobile soft-resume branch taken, mobile paused-resume branch, escalation to full reload, failover to next stream, "All streams unavailable".
- **scheduleStallCheck**
  - Log triggering event (`waiting`/`stalled`), whether it was suppressed by the initial-buffer grace, mobile progress check result, timer scheduling vs immediate recovery.
- **Background watchdog (`doWake`)**
  - Log the wake reason (`visibility` / `pageshow` / `online`), whether it short-circuited (recent progress), soft-resume path, paused-resume path, and stall-timeout escalation.
- **Audio element events**
  - `onError`: log `audio.error.code` + message, network state, ready state.
  - `onWaiting` / `onStalled` / `onPlaying` / `onPause` / `onEnded`: one-line log each.
  - `onPlay`: log resolved mode + currentTime.
- **Visibility / pageshow / online listeners**: log raw transitions before scheduling.

### 3. Make logging cheap & toggleable

- Gate verbose logs behind `localStorage.getItem("playback-debug") === "1"` OR the diagnostics panel being mounted (already implies the user wants visibility). Default ON for now so the user immediately sees the data on iOS/Android; document the toggle in a single-line comment.
- Never log secrets or full headers. URLs are already non-sensitive (public streams + proxy endpoint).

### Acceptance

- On iOS and Android remote consoles, every reconnect cycle prints an ordered trace: trigger event → decision branch → action taken → outcome.
- No change to playback behavior, UI, or timers.
- Desktop logs remain quiet unless an actual stall/reconnect happens (info-level events for resume/visibility are throttled to one line each).
