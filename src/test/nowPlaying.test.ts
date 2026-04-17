import { describe, expect, it } from "vitest";
import {
  normalizeNowPlayingValue,
  parseAzuracastNowPlaying,
  parseNowPlayingPayload,
  splitArtistTitle,
} from "@/lib/nowPlaying";

describe("now playing parsing", () => {
  it("parses azuracast now_playing.song fields", () => {
    expect(
      parseAzuracastNowPlaying({
        now_playing: {
          song: {
            artist: "Purple Motion",
            title: "Satellite One",
          },
        },
      }),
    ).toEqual({ artist: "Purple Motion", title: "Satellite One" });
  });

  it("parses text fallback from azuracast payload", () => {
    expect(
      parseNowPlayingPayload("azuracast", {
        now_playing: {
          song: {
            text: "Skaven - Catch That Goblin",
          },
        },
      }),
    ).toEqual({ artist: "Skaven", title: "Catch That Goblin" });
  });

  it("splits artist-title strings and handles title-only", () => {
    expect(splitArtistTitle("Jogeir Liljedahl - Leaving Teramis 10")).toEqual({
      artist: "Jogeir Liljedahl",
      title: "Leaving Teramis 10",
    });
    expect(splitArtistTitle("Skaven–Lizardking")).toEqual({
      artist: "Skaven",
      title: "Lizardking",
    });
    expect(splitArtistTitle("Ambient Interlude")).toEqual({
      artist: "Nectarine Radio",
      title: "Ambient Interlude",
    });
  });

  it("returns null for malformed or unsupported payloads", () => {
    expect(parseAzuracastNowPlaying(null)).toBeNull();
    expect(parseAzuracastNowPlaying({ now_playing: {} })).toBeNull();
    expect(parseNowPlayingPayload("unsupported", { now_playing: { song: { text: "A - B" } } })).toBeNull();
    expect(parseNowPlayingPayload(undefined, {})).toBeNull();
  });

  it("normalizes placeholder values", () => {
    expect(normalizeNowPlayingValue("-")).toBe("");
    expect(normalizeNowPlayingValue(" - ")).toBe("");
    expect(normalizeNowPlayingValue("Skaven")).toBe("Skaven");
    expect(normalizeNowPlayingValue(undefined)).toBe("");
  });
});
