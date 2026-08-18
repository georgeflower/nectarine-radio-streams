import { describe, expect, it } from "vitest";
import type { StreamSource } from "@/lib/nectarine";
import type { StreamReliabilityRow } from "@/lib/streamTelemetry";
import {
  bitrateDistance,
  isShortRunner,
  isUnreliable,
  rankStreams,
  reliabilityScore,
} from "@/lib/streamRanking";

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
    expect(ranked[0].name).toBe("c"); // 192 always first
    expect(ranked[1].name).toBe("b"); // then descending: 320
    expect(ranked[2].name).toBe("a"); // then 128


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

  it("demotes a stream that always dies after a few seconds", () => {
    const shortRun = { ...row("short", 1, 5), avg_played_sec_before_failure: 11 };
    expect(isShortRunner(shortRun)).toBe(true);
    expect(isUnreliable(shortRun)).toBe(true);

    // healthy long runs are untouched
    const longRun = { ...row("long", 16, 2), avg_played_sec_before_failure: 430 };
    expect(isShortRunner(longRun)).toBe(false);
    expect(isUnreliable(longRun)).toBe(false);

    // one bad sample is not enough
    const thin = { ...row("thin", 1, 1), avg_played_sec_before_failure: 5 };
    expect(isShortRunner(thin)).toBe(false);
  });

  it("does not condemn a mostly-healthy stream with a few quick failures", () => {
    const good = { ...row("inversi0n", 61, 4), avg_played_sec_before_failure: 5 };
    expect(isShortRunner(good)).toBe(false);
    expect(isUnreliable(good)).toBe(false);

    const bad = { ...row("ers35", 3, 10), avg_played_sec_before_failure: 5 };
    expect(isShortRunner(bad)).toBe(true);
    expect(isUnreliable(bad)).toBe(true);
  });

  it("ranks a proxied 192 above a direct 128", () => {
    const proxied192 = s("proxied192", "192");
    const direct128 = s("direct128", "128");
    const needsProxy = (url: string) => url === proxied192.url;
    const ranked = rankStreams([direct128, proxied192], new Map(), {
      isMobile: false,
      needsProxy,
    });
    expect(ranked[0].name).toBe("proxied192");
  });

  it("prefers a direct 192 over a proxied 192", () => {
    const direct = s("direct", "192");
    const proxied = s("proxied", "192");
    const needsProxy = (url: string) => url === proxied.url;
    expect(rankStreams([proxied, direct], new Map(), { isMobile: false, needsProxy })[0].name).toBe(
      "direct",
    );
  });

  it("orders a mixed set 192, 128, 64, 48 with dead streams last", () => {
    const a192 = s("a192", "192");
    const b128 = s("b128", "128");
    const c64 = s("c64", "64");
    const d48 = s("d48", "48");
    const dead = s("dead192", "192");
    const rel = new Map<string, StreamReliabilityRow>([
      [dead.url, { ...row(dead.url, 0, 12), avg_played_sec_before_failure: 2 }],
    ]);
    const ranked = rankStreams([d48, dead, c64, a192, b128], rel, opts);
    expect(ranked.map((r) => r.name)).toEqual(["a192", "b128", "c64", "d48", "dead192"]);
  });
});


