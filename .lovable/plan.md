

## Goal
1. Make every stream listed under "Live Streams" selectable in the player (not just HTTPS).
2. Improve resilience by pre-buffering ~30 seconds of audio while playback continues, so brief network drops don't interrupt playback.

## Changes

### 1. `src/components/AudioPlayer.tsx` — accept all streams
- Remove the `s.url.startsWith("https://")` filter in the `playable` memo. Since the audio-proxy edge function already accepts both `http:` and `https:` (and the request to the proxy itself is HTTPS), HTTP streams work fine via the proxy without mixed-content issues.
- Keep the bitrate-descending sort so the highest-bitrate stream is still picked first.
- Result: the dropdown now contains every stream that appears in the "Live Streams" section.

### 2. `src/components/AudioPlayer.tsx` — 30-second buffer strategy
HTML `<audio>` doesn't expose a direct "buffer size" knob, but we can influence behavior:
- Set `audio.preload = "auto"` (already set on play) to let the browser fetch ahead aggressively.
- Add a periodic check (every 2s while playing) that inspects `audio.buffered`:
  - Compute `bufferedAhead = bufferedEnd - currentTime`.
  - Target ~30s ahead. The browser controls actual fetch, but for a live ICY/Shoutcast stream, `buffered` grows as bytes arrive faster than playback consumes them.
  - If `bufferedAhead < 5s` while playing, surface a small "Low buffer" hint (optional indicator) but don't act yet.
  - If a stall occurs and `bufferedAhead > 0`, the audio element will naturally keep playing from the buffer — no change needed; this just improves UX visibility.
- Increase `STALL_TIMEOUT_MS` from 10s → 30s so we tolerate longer interruptions before failing over (matches the buffer goal — reconnect only when the buffer is truly exhausted).
- Display current buffer-ahead seconds in the status line (small text, e.g. `buf: 27s`) so the user can see it's healthy.

### 3. Quick playback start
- Already starts as soon as the browser has enough data (default behavior). No change needed; the 30s target is approached *during* playback, not before.
- Confirm `preload="auto"` is set when `playUrl` runs (it is).

## Technical notes
- The audio-proxy `ALLOWED_HOSTS` already includes the Nectarine relay hostnames; HTTP streams from those hosts will work through the proxy. If a stream is from a host outside the allowlist, the proxy returns 403 and the existing failover will skip it after retries — acceptable behavior.
- We can't force a specific buffer size in browsers; we can only observe `audio.buffered`. The "30s buffer" is achieved by tolerating stalls longer (since the buffer naturally fills) rather than blocking playback start.

## Files touched
- `src/components/AudioPlayer.tsx` (only)

## Acceptance
- Dropdown shows every stream listed in the Live Streams section.
- Playback starts within ~1–2s of pressing play.
- Status line shows a buffer indicator (e.g. `buf: 28s`) once buffer fills.
- Brief 10–25s network interruptions no longer cause a reconnect; only sustained drops trigger failover.

