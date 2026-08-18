// Stream ranking: always aim for TARGET_BITRATE, with a reliability safety valve.

import type { StreamSource } from "@/lib/nectarine";
import type { StreamReliabilityRow } from "@/lib/streamTelemetry";

export const TARGET_BITRATE = 192;

const rawBitrate = (stream: StreamSource): number => {
  const raw = stream?.bitrate;
  if (raw === null || raw === undefined) return Number.NaN;
  if (typeof raw === "string" && raw.trim() === "") return Number.NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
};

export const bitrateDistance = (stream: StreamSource): number => {
  const n = rawBitrate(stream);
  if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
  return Math.abs(n - TARGET_BITRATE);
};

export const reliabilityScore = (row: StreamReliabilityRow | undefined): number => {
  if (!row) return 0.5;
  const connects = Number(row.connects) || 0;
  const failures = Number(row.failures) || 0;
  return (connects + 1) / (connects + failures + 2);
};

// A stream that "works" but drops the socket after a few seconds is worse than
// one that fails outright — the ratio maths alone cannot see that, so look at
// how long playback actually survived before the failure.
export const SHORT_RUN_SEC = 60;

export const SHORT_RUN_FAILURE_RATE = 0.3;

const failureRate = (connects: number, failures: number): number => {
  const total = connects + failures;
  return total > 0 ? failures / total : 0;
};

export const isShortRunner = (row: StreamReliabilityRow | undefined): boolean => {
  if (!row) return false;
  const connects = Number(row.connects) || 0;
  const failures = Number(row.failures) || 0;
  if (failures < 2 || connects + failures < 3) return false;
  if (failureRate(connects, failures) < SHORT_RUN_FAILURE_RATE) return false;
  const avg = row.avg_played_sec_before_failure;
  if (avg === null || avg === undefined) return false;
  const n = Number(avg);
  return Number.isFinite(n) && n < SHORT_RUN_SEC;
};

export const isUnreliable = (row: StreamReliabilityRow | undefined): boolean => {
  if (!row) return false;

  // A stream that has proven itself in the last 3 days is not dead, whatever
  // its older history says. New incidents inside that window re-demote it
  // automatically, so this needs no stored state.
  const recentConnects = Number(row.recent_connects) || 0;
  const recentIncidents = Number(row.recent_incidents) || 0;
  if (recentConnects >= 1 && recentIncidents === 0) return false;

  const connects = Number(row.connects) || 0;
  const failures = Number(row.failures) || 0;


  let flagged = false;
  if (isShortRunner(row)) flagged = true;
  else if (connects + failures >= 5 && reliabilityScore(row) < 0.5) flagged = true;

  if (flagged && failureRate(connects, failures) < 0.1) {
    console.warn(
      `[streamRanking] miscalibrated? flagging ${row.stream_url} as unreliable despite a low failure rate`,
      { connects, failures, avg_played_sec_before_failure: row.avg_played_sec_before_failure },
    );
  }
  return flagged;
};

// 192 is the sweet spot; anything else sorts by descending bitrate below it.
const bitrateRank = (stream: StreamSource): [number, number] => {
  const n = rawBitrate(stream);
  if (!Number.isFinite(n)) return [2, 0]; // unknown last
  if (n === TARGET_BITRATE) return [0, 0];
  return [1, -n];
};

export const rankStreams = (
  streams: StreamSource[],
  reliability: Map<string, StreamReliabilityRow>,
  opts: { isMobile: boolean; needsProxy: (url: string) => boolean },
): StreamSource[] => {
  return [...streams].sort((a, b) => {
    const ar = reliability.get(a.url);
    const br = reliability.get(b.url);

    // 1. dead streams last
    const au = isUnreliable(ar);
    const bu = isUnreliable(br);
    if (au !== bu) return au ? 1 : -1;

    // 2. bitrate: 192 first, then descending, unknown last
    const [ag, av] = bitrateRank(a);
    const [bg, bv] = bitrateRank(b);
    if (ag !== bg) return ag - bg;
    if (av !== bv) return av - bv;

    // 3. direct beats proxied
    const ap = opts.needsProxy(a.url);
    const bp = opts.needsProxy(b.url);
    if (ap !== bp) return ap ? 1 : -1;

    // 4. reliability score descending
    return reliabilityScore(br) - reliabilityScore(ar);
  });
};


