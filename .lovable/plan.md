Edit only `src/components/AudioPlayer.tsx`.

1. Add `loadingRef`, `lastLoadAtRef`, `currentTargetRef`, and `INITIAL_BUFFER_GRACE_MS = 8000`. Set the first two around `await a.play()` in `playUrl`.

2. In `playUrl`: if `currentTargetRef.current === target` and `!a.paused`, just return after `a.play().catch(...)` — don't tear down MSE. Otherwise update `currentTargetRef` before attaching.

3. Wake-watchdog: remove the `focus` listener; keep visibility/pageshow/online. In `doWake`, return early when `loadingRef.current` is true. Never call `attemptRecovery` unless `a.paused` AND `Date.now() - lastLoadAtRef.current > stallTimeoutMs`. If `readyState >= 2` and paused, just `a.play()`.

4. `onWaiting` / `onStalled`: also early-return when `loadingRef.current` or `Date.now() - lastLoadAtRef.current < INITIAL_BUFFER_GRACE_MS`.

5. Wrap `await a.play()` in try/catch; swallow `AbortError` and any error whose message contains "interrupted by" — do not surface as `setError`.

6. `handleSelect`: if the URL equals current selection and already playing, skip the rebuild.

Acceptance: desktop plays via MSE without a reconnect loop; mobile no longer shows the red "play() request was interrupted" banner; backgrounding/foregrounding only triggers recovery on real stalls.