import { describe, expect, it } from "vitest";
import type { StreamSource } from "@/lib/nectarine";
import type { StreamReliabilityRow } from "@/lib/streamTelemetry";
import { bitrateDistance, isUnreliable, rankStreams, reliabilityScore } from "@/lib/streamRanking";

const s = (name: string, bitrate: string): StreamSource => ({
  name,
  url: `https://example.com/${name}`,
  bitrate,
  type: "audio/mpeg",
});

const row = (url: string, connects: number, failures: number): StreamReliabilityRow => ({
  stream_url: url,
  stream_name: url,
  bitrate: null,
  connects,
  failures,
  handover_events: 0,
  avg_played_sec_before_failure: null,
  last_seen_at: null,
});

const opts = { isMobile: false, needsProxy: () => false };

describe("streamRanking", () => {
  it("prefers 192 over both 128 and 320", () => {
    const list = [s("a", "128"), s("b", "320"), s("c", "192")];
    const ranked = rankStreams(list, new Map(), opts);
    expect(ranked[0].name).toBe("c");
    expect(ranked[1].name).toBe("a"); // 64 away
    expect(ranked[2].name).toBe("b"); // 128 away

    // ties on distance (64): higher raw bitrate first
    const tie = rankStreams([s("low", "128"), s("high", "256")], new Map(), opts);
    expect(tie[0].name).toBe("high");
  });

  it("does not mutate the input", () => {
    const list = [s("a", "128"), s("c", "192")];
    rankStreams(list, new Map(), opts);
    expect(list[0].name).toBe("a");
  });

  it("does not flag a stream with zero observations as unreliable", () => {
    expect(isUnreliable(undefined)).toBe(false);
    expect(isUnreliable(row("x", 0, 0))).toBe(false);
    expect(isUnreliable(row("x", 0, 4))).toBe(false);
    expect(reliabilityScore(undefined)).toBe(0.5);
  });

  it("sorts a chronically failing 192 stream below a healthy 128 stream", () => {
    const bad = s("bad", "192");
    const good = s("good", "128");
    const rel = new Map<string, StreamReliabilityRow>([
      [bad.url, row(bad.url, 1, 20)],
      [good.url, row(good.url, 30, 1)],
    ]);
    const ranked = rankStreams([bad, good], rel, { isMobile: false, needsProxy: () => false });
    expect(ranked[0].name).toBe("good");
    expect(isUnreliable(rel.get(bad.url))).toBe(true);
  });

  it("sorts missing-bitrate streams last", () => {
    const unknown = s("unknown", "");
    const ranked = rankStreams([unknown, s("a", "64")], new Map(), opts);
    expect(ranked[1].name).toBe("unknown");
    expect(bitrateDistance(unknown)).toBe(Number.POSITIVE_INFINITY);
  });
});
