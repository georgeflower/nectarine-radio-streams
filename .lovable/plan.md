## Plan

Fix the mobile streaming regression in `src/components/AudioPlayer.tsx` only.

### 1. Stop recovery from rebuilding healthy mobile audio
- Treat mobile direct `<audio>` playback as the primary stable path.
- Do not call full reconnect/reload on every `waiting`, `stalled`, `pageshow`, or `visibility` event.
- Only reconnect if playback is expected, the element is truly not advancing for longer than the configured stall threshold, and there is no usable buffered/playing state.

### 2. Add playback-progress stall detection
- Track the last time `currentTime` advanced.
- On mobile, use that timestamp as the main watchdog signal instead of relying on Safari/Chrome `waiting` events, which can fire during normal background buffering.
- If the audio is still advancing or recently advanced, clear reconnect UI and avoid switching/reloading streams.

### 3. Prevent the bogus 6:42 live-stream timer
- Live radio streams sometimes expose a finite `audio.duration` after a reconnect/proxy restart, even though it is not a real song length.
- Stop publishing finite HTML audio duration to the cracktro info box for live stream playback.
- Keep publishing elapsed playback time, but send duration as `0`/unknown unless a real track duration is explicitly available elsewhere.

### 4. Make mobile reconnect less destructive
- For mobile recovery, first try `audio.play()` on the same source without cache-busting or resetting `src`.
- Only if that fails/stays stalled past the threshold should it rebuild the stream URL.
- Avoid failover to a different stream on transient mobile background stalls.

### 5. Diagnostics stay useful
- Continue reporting resume/reconnect/stall events.
- Add more precise diagnostic event reasons such as `mobile-soft-resume`, `mobile-stall-timeout`, and `same-src-play` so the diagnostics overlay shows what happened.

### Acceptance
- On iPhone/Android, short `waiting`/background hiccups do not show `Reconnecting…` unless playback has actually stopped advancing past the configured timeout.
- The stream does not restart every few minutes on Android.
- After any reconnect, the cracktro info box no longer shows a fake countdown like `6:42`; live duration remains unknown until proper song metadata changes.
- Desktop MSE behavior from the previous fix remains unchanged.