import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSongArtworkCacheForTests,
  getBestArtworkUrl,
  getCachedSongArtwork,
  requestSongArtwork,
  subscribeSongArtwork,
} from "@/lib/songArtwork";

describe("songArtwork", () => {
  beforeEach(() => {
    __resetSongArtworkCacheForTests();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requestSongArtwork fetches once and notifies subscribers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        screenshotUrl: "https://scenestream.net/static/media/screenshot/image/1.gif",
        platformIconUrl: "https://scenestream.net/static/media/platform/symbol/koeksid.png",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const notified = vi.fn();
    subscribeSongArtwork(notified);

    requestSongArtwork("123");
    requestSongArtwork("123"); // dedupe
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notified).toHaveBeenCalled();
    expect(getCachedSongArtwork("123")?.screenshotUrl).toContain("1.gif");
    expect(getBestArtworkUrl("123")).toContain("1.gif");
  });

  it("getBestArtworkUrl falls back to platform icon when no screenshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          platformIconUrl: "https://scenestream.net/static/media/platform/symbol/koekym.png",
        }),
      }),
    );
    requestSongArtwork("999");
    await new Promise((r) => setTimeout(r, 0));
    expect(getBestArtworkUrl("999")).toContain("koekym.png");
  });

  it("cache hit skips fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ screenshotUrl: "https://x/y.png" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    requestSongArtwork("42");
    await new Promise((r) => setTimeout(r, 0));
    fetchMock.mockClear();
    requestSongArtwork("42");
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns undefined for empty songId", () => {
    expect(getCachedSongArtwork(undefined)).toBeUndefined();
    expect(getBestArtworkUrl(null)).toBeUndefined();
  });

  it("edge function wraps screenshot URLs via wsrv.nl PNG transform", async () => {
    // Simulate what the edge function returns.
    const original = "https://scenestream.net/static/media/screenshot/image/65367.gif";
    const proxied =
      `https://wsrv.nl/?url=${encodeURIComponent(
        original.replace(/^https?:\/\//i, ""),
      )}&output=png&n=-1&w=512&h=512&fit=contain&we`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ screenshotUrl: proxied }),
      }),
    );
    requestSongArtwork("7777");
    await new Promise((r) => setTimeout(r, 0));
    const url = getBestArtworkUrl("7777") || "";
    expect(url).toContain("wsrv.nl");
    expect(url).toContain("output=png");
    expect(url).toContain(encodeURIComponent("scenestream.net"));
  });
});
