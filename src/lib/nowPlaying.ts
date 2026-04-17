export type NowPlayingTrack = {
  artist: string;
  title: string;
};

function toTrack(artist?: string, title?: string): NowPlayingTrack | null {
  const cleanArtist = (artist ?? "").trim();
  const cleanTitle = (title ?? "").trim();
  if (!cleanArtist && !cleanTitle) return null;
  return {
    artist: cleanArtist || "Nectarine Radio",
    title: cleanTitle || "Live Stream",
  };
}

export function splitArtistTitle(raw: string): NowPlayingTrack | null {
  const value = raw.trim();
  if (!value) return null;
  const parts = value.split(" - ");
  if (parts.length >= 2) {
    return toTrack(parts[0], parts.slice(1).join(" - "));
  }
  return toTrack("", value);
}

export function parseAzuracastNowPlaying(payload: unknown): NowPlayingTrack | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const nowPlaying = (data.now_playing ?? data.nowPlaying) as Record<string, unknown> | undefined;
  const song = nowPlaying?.song as Record<string, unknown> | undefined;
  const artist = typeof song?.artist === "string" ? song.artist : "";
  const title = typeof song?.title === "string" ? song.title : "";
  if (artist || title) return toTrack(artist, title);
  const text = typeof song?.text === "string" ? song.text : "";
  if (text) return splitArtistTitle(text);
  return null;
}

export function parseNowPlayingPayload(format: string | undefined, payload: unknown): NowPlayingTrack | null {
  if (!format || format === "azuracast") return parseAzuracastNowPlaying(payload);
  return null;
}
