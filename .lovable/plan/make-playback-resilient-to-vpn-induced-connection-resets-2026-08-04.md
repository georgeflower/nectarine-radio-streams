## Make playback resilient to VPN-induced connection resets

### Confirmed diagnosis

- The recurring desktop failures were caused by Proton VPN, not the player or the backend proxy.
- A VPN can reset or fragment long-lived HTTP/2 audio streams, producing `MEDIA_ERR_NETWORK` after roughly 9–10 seconds even though the stream itself is healthy.
- The current player keeps retrying the same stream indefinitely, so the user hears a reconnect every few seconds while the VPN path keeps breaking.

## Changes

### 1. Treat repeated `MEDIA_ERR_NETWORK` as a stream failure on desktop

In `AudioPlayer.tsx`, when a `MEDIA_ERR_NETWORK` (code 2) fires on desktop and the same URL has already been force-recovered recently, mark that stream as failed for the cooldown period and fail over to the next candidate instead of reloading the same URL again.

### 2. Prefer direct HTTPS streams on desktop

Update `playbackUrl` so HTTPS streams are loaded directly on desktop (not routed through the proxy). This gives the VPN one less hop to reset and lets the browser use the origin’s CORS headers for Web Audio. Keep the proxy only for HTTP streams that mixed-content rules block.

### 3. Promote direct streams in ranking on desktop

In `streamRanking.ts`, prefer a direct (non-proxied) stream over a proxied one on desktop when reliability and bitrate are otherwise equal, matching the existing mobile behaviour.

### 4. Add a user-facing hint

In `PerformanceTipsModal.tsx`, add a short note that VPNs can interrupt live streams and suggest disconnecting the VPN or switching to a direct HTTPS mirror if reconnects persist.

### 5. Verification

- Add ranking tests proving a direct HTTPS 192 kbps source wins over a proxied HTTP 192 kbps source on desktop.
- Simulate a code-2 loop in unit logic: after two forced recoveries on the same URL, the next recovery should pick a different stream.
- Confirm the player still uses the proxy for HTTP streams on HTTPS pages and that Web Audio analyser data continues to flow.

## Expected result

When a VPN resets the current stream, the player will quickly move to a direct HTTPS mirror instead of looping on the broken path. Users without a VPN will also benefit from fewer proxy hops on desktop.
