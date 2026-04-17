# Nectarine Radio Streams

## Optional now-playing metadata per station

The player supports per-station now-playing polling for Media Session metadata (lock screen/car Bluetooth display).

If your stream XML includes station metadata, add optional fields on each `<stream>` entry:

- `nowPlayingUrl` (or `nowplaying_url`)
- `nowPlayingFormat` (currently supports `azuracast`)
- `nowPlayingIntervalMs` (optional polling interval, defaults to 20000)
- `artworkUrl` (or `logo`)

Example:

```xml
<stream
  name="My Station"
  url="https://example.com/stream"
  nowPlayingUrl="https://example.com/api/nowplaying/station"
  nowPlayingFormat="azuracast"
  artworkUrl="https://example.com/logo.png"
/>
```

When these are not present, the app falls back to station name and Nectarine track data.
