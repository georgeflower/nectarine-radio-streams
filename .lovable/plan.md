## What the telemetry actually says

120 events, 2 sessions, 31 Jul – 1 Aug (Android + desktop).

| Stream | connect_ok | error | ended | avg played before fail |
|---|---|---|---|---|
| `http://nectarine.ers35.net:8000/necta192.mp3` | 9 | 0 | 0 | — |
| `http://nectarine.from-de.com/necta192` | 16-17 | 2 | 2 | ~353–430 s |
| `https://nectarine.inversi0n.org/necta192.mp3` | 9 | 1 | 0 | 65 s |
| `http://nectarine.from-de.com/necta64` | 1 | 0 | 0 | — |
| `https://scenestream.io/necta128.ogg` | 1 | 0 | 2 | **11 s** |

Three findings:

1. **The dominant signal is not stream quality — it is connection-change spam.** Of 71 `connection_change` events, **66 are same-type flaps** (`cellular->cellular` ×39, `wifi->wifi` ×27); only 5 are real handovers. Every one of them schedules a **forced cache-busted hard reload** 1200 ms later. On Android, `effectiveType` flaps constantly (especially with the screen off), so the player keeps tearing down a healthy socket. This matches the reported "disconnects for a few seconds then restarts". It also poisons the reliability stats, because the reloads generate the errors we then attribute to the stream.

2. **`scenestream.io/necta128.ogg` is broken for our use.** Both plays fired `media-ended` after ~9–13 s: the server closes / the Ogg chain terminates almost immediately. It should not be a candidate.

3. **`media-error-4` (Format error, `networkState=3`, `readyState=0`) is what kills the two "good" streams** — from-de at ~398 s and inversi0n at ~65 s. Code 4 with readyState 0 is a *fetch/connection* failure surfaced as a format error, i.e. the socket died, not a codec problem. Both are consistent with finding 1, and inversi0n's 65 s failure happened immediately after a manual switch, so its low `avg_played_before_failure` is not yet trustworthy.

Given 2 sessions and ≤17 connects per stream, the reliability numbers are **not yet statistically meaningful** — the existing `isUnreliable` guard (needs ≥5 samples, score <0.5) has never fired and shouldn't be tightened on this data. The correct move is to fix the noise sources first, then let ranking learn from clean data.

## Proposed changes

### A. Stop the false-handover reloads (`src/components/AudioPlayer.tsx`)
In the connection-change effect:
- Still record the `connection_change` telemetry event for every change (keeps the diagnostic signal).
- Only schedule the forced recovery when the **physical `type` actually changed** (`wifi`↔`cellular`↔`ethernet`/`none`), or when `type` is unavailable *and* `effectiveType` changed across a real tier boundary (e.g. `4g`→`2g`), never on same-value repeats.
- Add a cooldown (~15 s) so a burst of change events can trigger at most one forced recovery.
- On a same-type change, do a cheap liveness check instead: if `currentTime` has advanced within the stall window, do nothing.

### B. Filter out streams that can't work (`src/lib/streamRanking.ts` / `playable` memo)
- Exclude `.ogg`/`.opus` URLs on Safari/iOS (unsupported) and exclude `scenestream.io/necta128.ogg` from automatic selection via the existing unreliable path — see C, no hardcoded blocklist.
- Keep the existing `https?://` filter and the mixed-content-proxy penalty on mobile.

### C. Make ranking use the failure *mode*, not just counts
Extend `StreamReliabilityRow` consumption in `streamRanking.ts`:
- Treat a stream whose **average played-time before `ended`/`error` is under ~60 s** as unreliable regardless of the connect/fail ratio (this is what catches the `.ogg` stream: 1 connect, 2 ends at 11 s — today's ratio maths rates it fine).
- Require ≥3 samples for that rule so a single bad session can't demote a good stream.
- Leave the 192 kbps target ordering and the existing tie-breaks unchanged.

### D. Suggested primary order (result of the above, on current data)
1. `http://nectarine.ers35.net:8000/necta192.mp3` — 9/9 clean, no errors, longest clean runs
2. `http://nectarine.from-de.com/necta192` — highest volume, only fails at ~6–7 min (i.e. at the reload events)
3. `https://nectarine.inversi0n.org/necta192.mp3` — HTTPS, no proxy needed; promote to #1 on mobile since it avoids the mixed-content proxy hop
4. `https://scenestream.io/necta128.ogg` — demoted (short-run rule)
5. `necta64` and other low bitrates — last, as today

Note on the two HTTP 192 streams: on an HTTPS page they must go through the audio proxy, which adds a failure surface. Ranking already prefers non-proxied on mobile; I'd extend that preference to desktop as a final tie-break so the HTTPS 192 stream wins when everything else is equal.

### E. Diagnostics panel (`src/components/PlaybackDiagnostics.tsx`)
Add to the reliability section, using existing tokens:
- a `same-net flaps` counter vs `real handovers`, so the noise is visible;
- mark streams demoted by the short-run rule with the existing `unreliable` styling.

## Technical notes
- No schema change needed; `stream_events` already carries `reason`, `played_sec`, `media_error_code`, `network_state`, `ready_state`.
- The `stream_reliability` view may need `avg_played_sec_before_failure` to include `ended` events (not only `error`) for rule C to see the `.ogg` case — I'll verify the view definition and adjust it in a migration if it excludes `ended`.
- Tests: extend `src/test/streamRanking.test.ts` with the short-run demotion and the proxy tie-break; no other suite touched.
