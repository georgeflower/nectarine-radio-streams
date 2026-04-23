

## Why the buffer shows ~2s

For live ICY/Shoutcast streams, browsers (especially Chrome/Safari) intentionally keep the `<audio>` buffer small (1–5s) to stay close to "live." `preload="auto"` is just a hint — there's no JS API to force a larger buffer on a plain `<audio src=...>` element. The stream is also delivered at its natural bitrate, so the buffer can't grow faster than playback consumes it.

To actually pre-buffer ~30s, we need to switch from native `<audio src>` to **MediaSource Extensions (MSE)** with our own fetch loop that reads ahead aggressively into a `SourceBuffer`.

## Plan: MSE-based buffered playback

### 1. New module: `src/lib/bufferedStream.ts`
- Exports `attachBufferedStream(audio, url, { targetBufferSec: 30 })`.
- Creates a `MediaSource`, attaches via `audio.src = URL.createObjectURL(ms)`.
- On `sourceopen`, creates a `SourceBuffer` with the right MIME (`audio/mpeg` for MP3, `audio/aac` for AAC — sniff from upstream `Content-Type` returned via a small HEAD-style call or default to `audio/mpeg`).
- Starts a `fetch(proxiedUrl)` and reads the body via `ReadableStream` reader in a loop:
  - Appends chunks to `SourceBuffer` as fast as the network delivers them (no throttling — proxy already streams at upstream rate, but we no longer rely on browser's conservative live-stream policy).
  - Tracks `bufferedAhead = sourceBuffer.buffered.end(last) - audio.currentTime`.
  - Pauses appending when `bufferedAhead >= targetBufferSec` (back-pressure) and resumes when it drops below `targetBufferSec * 0.7`.
  - On stall/disconnect, the existing 30s of buffer keeps playing while we silently re-fetch and resume appending.
- Returns a `cleanup()` function for unmount/stream-switch.

### 2. `src/components/AudioPlayer.tsx`
- Replace the direct `audio.src = proxiedUrl(...)` assignment in `playUrl` with a call to `attachBufferedStream`.
- Detect MSE support: `'MediaSource' in window && MediaSource.isTypeSupported('audio/mpeg')`. If unsupported (rare — older Safari), fall back to current direct-src behavior.
- The existing buffer-display effect already reads `audio.buffered`, so the `buf: Xs` indicator will automatically reflect the new ~30s value.
- Existing retry/failover logic stays — but stalls will be far rarer because the buffer absorbs network blips up to 30s.

### 3. Caveats / notes
- **MP3 vs AAC**: We'll sniff Content-Type on first response chunk. Most Nectarine streams are MP3 (`audio/mpeg`). AAC streams need `audio/aac` or `audio/mp4; codecs="mp4a.40.2"`.
- **iOS Safari**: MSE for audio works on iOS 17.1+. Older iOS will fall back to native `<audio>` (current 2s behavior).
- **AnalyserNode**: Continues to work — `MediaElementAudioSourceNode` still wraps the `<audio>` element regardless of how its source is fed.
- **Live latency**: With 30s buffer, "now playing" metadata may be ~30s ahead of the audio you hear. Acceptable for radio listening.

### 4. Acceptance
- `buf:` indicator climbs to ~30s within the first ~30s of playback.
- Pulling the network for 20s while playing causes no audio interruption (drains buffer instead of reconnecting).
- Falls back gracefully on browsers without MSE audio support.

## Files touched
- `src/lib/bufferedStream.ts` (new)
- `src/components/AudioPlayer.tsx`

