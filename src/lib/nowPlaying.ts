export type NowPlayingTrack = {
  artist: string;
  title: string;
};

export const DEFAULT_NOW_PLAYING_FORMAT = "azuracast";
export const NOW_PLAYING_FALLBACK_ARTIST = "Nectarine Radio";
export const NOW_PLAYING_FALLBACK_TITLE = "Live Stream";
const ARTIST_TITLE_SEPARATOR_RE = /^(.+?)\s*[-–—]\s*(.+)$/;

function toTrack(artist?: string, title?: string): NowPlayingTrack | null {
  const cleanArtist = (artist ?? "").trim();
  const cleanTitle = (title ?? "").trim();
  if (!cleanArtist && !cleanTitle) return null;
  return {
    artist: cleanArtist || NOW_PLAYING_FALLBACK_ARTIST,
    title: cleanTitle || NOW_PLAYING_FALLBACK_TITLE,
  };
}

export function splitArtistTitle(raw: string): NowPlayingTrack | null {
  const value = raw.trim();
  if (!value) return null;
  const match = value.match(ARTIST_TITLE_SEPARATOR_RE);
  if (match) {
    return toTrack(match[1], match[2]);
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
  if (!format || format === DEFAULT_NOW_PLAYING_FORMAT) return parseAzuracastNowPlaying(payload);
  return null;
}
