
The user wants the audio player to be more resilient: when a stream drops, automatically recover (reconnect or fail over to another stream), and prefer highest-bitrate streams.

## Current behavior
`AudioPlayer.tsx` uses a plain `<audio>` element via the `audio-proxy` edge function. On error or `onEnded`, it just sets `playing=false` — no retry, no failover. Stream selection is whatever the user picked first; the auto-select picks `playable[0]` (no bitrate sort).

## Proposed improvements

### 1. Sort streams by bitrate (highest first)
In the `playable` memo, sort by `bitrate` descending so the default selection is the highest-quality HTTPS stream.

### 2. Auto-reconnect on drop
On `onError` or `onEnded` while the user intended to be playing (`shouldPlayRef`), attempt:
- **Retry up to 3 times** on the same stream with exponential backoff (1s, 2s, 4s).
- If retries fail, **fail over** to the next stream in the bitrate-sorted list, marking the failed one temporarily skipped (cooldown ~60s).
- Track `shouldPlayRef` (set true on play, false on user-pause) so reconnect only happens when the user wants playback.

### 3. Stall detection
Listen for `stalled` and `waiting` events. If audio stays in a waiting state for >10s while `shouldPlayRef` is true, treat as a drop and trigger the same retry/failover logic.

### 4. Buffer hint
Set `audio.preload = "auto"` once playing and add `Cache-Control` already exists. Browsers control buffer size for live streams, but we can keep MediaSession state correct and reset `src` cleanly on reconnect (cache-bust with `&t=Date.now()` to force a fresh upstream connection through the proxy).

### 5. UI feedback
Show "Reconnecting…" state and which stream is now active when failover happens (toast or inline status).

## Files to change
- `src/components/AudioPlayer.tsx` — add bitrate sort, reconnect/failover logic, stall detection, status UI.

No edge function or DB changes needed. The existing `audio-proxy` already streams with `no-store` and supports range.

## Acceptance
- Highest-bitrate HTTPS stream is selected by default.
- If stream drops, player retries silently up to 3 times, then switches to next best stream.
- If all streams fail, shows clear error.
- User pausing stops the recovery loop.
