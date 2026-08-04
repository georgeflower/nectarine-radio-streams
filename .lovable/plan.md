## Fix the recurring desktop stream failures

### Confirmed diagnosis

- Firefox reports `MediaError` code 2 (`MEDIA_ERR_NETWORK`) after roughly 9–10 seconds while audio is still progressing normally.
- The active target is the backend `audio-proxy`, even for HTTPS streams that can be loaded directly.
- Backend logs show the proxy response connection repeatedly closing before completion at the same cadence.
- Direct checks of both the HTTP MP3 source and the HTTPS MP3 source remained open for the test duration. The HTTPS source also provides CORS, so it can feed the desktop Web Audio analyser without the proxy.
- The Firefox privacy warning is only Firefox hiding the error-message text; it is not the cause. The meaningful signal is error code 2.

## Changes

### 1. Bypass the proxy for secure desktop streams

Update `AudioPlayer.tsx` so HTTPS audio streams are used directly on desktop as well as mobile. Keep the proxy only for HTTP streams that an HTTPS page cannot load because of mixed-content rules.

This preserves Web Audio visualizer support because the tested HTTPS stream returns `Access-Control-Allow-Origin: *`.

### 2. Stop repeatedly reloading a broken proxy path

When a desktop `MEDIA_ERR_NETWORK` occurs on a proxied stream:

- do not cache-bust and reconnect to the same proxy endpoint indefinitely;
- mark that stream failed for the existing cooldown and immediately fail over to the best direct HTTPS candidate;
- retain same-stream forced recovery for genuine network handovers and direct-stream failures.

### 3. Prefer direct desktop streams before proxied streams

Adjust stream ranking so a usable direct HTTPS source ranks ahead of an HTTP source requiring the proxy on desktop, rather than using proxy status only as the final tie-break. Keep reliability and the 192 kbps target within each direct/proxied group.

### 4. Make proxy cancellation non-noisy

In `audio-proxy`, explicitly cancel the upstream response body when the downstream request is aborted. This will not make the function a preferred long-lived audio transport, but it will release resources cleanly when browsers disconnect or users switch streams.

### 5. Verification

- Add ranking coverage proving a direct HTTPS 192 kbps source wins over a proxied HTTP 192 kbps source even when the latter has better historical telemetry.
- Verify Firefox uses a direct HTTPS target, remains playing beyond the prior 5–10 second failure window, and the analyser-driven visuals still receive audio.
- Verify a proxied-stream code-2 error fails over instead of entering the repeated hard-reload loop.

## Expected result

Desktop playback should settle on the HTTPS MP3 stream without recurring proxy disconnects. HTTP mirrors remain selectable as fallbacks, but a proxy failure will move playback to a direct source rather than restarting every few seconds.
