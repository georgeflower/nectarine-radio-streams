

## Plan: Make visualizers actually react to the music

### Root cause

Most Nectarine/Shoutcast/Icecast streams don't send `Access-Control-Allow-Origin` headers. Because `<audio crossOrigin="anonymous">` is set, the browser plays the audio fine but **taints** the `MediaElementSource`, so `AnalyserNode` only ever sees zeros (freq) and 128 (waveform). That's why:
- Bars look dead
- Starfield/plasma only show their tiny idle motion
- Oscilloscope is a flat line

### Fix: proxy the audio through our edge function

We already have a `xml-proxy` edge function. I'll add a sibling **`audio-proxy`** edge function that:
- Accepts `?url=<stream_url>`
- Fetches the upstream stream with `Range`/streaming pass-through
- Returns it with proper CORS headers (`Access-Control-Allow-Origin: *`) and the upstream `Content-Type`
- Streams the body through (no buffering) so live radio keeps flowing

Then in `AudioPlayer`:
- Route the selected stream URL through the proxy: `${SUPABASE_URL}/functions/v1/audio-proxy?url=${encodeURIComponent(selectedUrl)}`
- Keep `crossOrigin="anonymous"` — now CORS will succeed, the source is no longer tainted, and the analyser receives real PCM data

### Why this works

Once the `MediaElementSource` is non-tainted, `getByteFrequencyData` returns real spectrum data and `getByteTimeDomainData` returns the real waveform. The existing visualizer code already maps these to bass/mid/treble/rms — no visualizer changes needed.

### Files

- **New** `supabase/functions/audio-proxy/index.ts` — streaming CORS proxy for audio
- **Update** `supabase/config.toml` — register the new function with `verify_jwt = false`
- **Update** `src/components/AudioPlayer.tsx` — wrap stream URLs with the proxy URL when assigning `a.src`

### Notes

- Stream switching keeps working (same `MediaElementSource`, just new `src`)
- Volume/mute logic untouched
- If a stream already has CORS (rare), the proxy is still safe — it just adds a tiny relay hop
- No visualizer code changes — they already react correctly, they just had no signal

