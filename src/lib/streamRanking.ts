// Stream ranking: always aim for TARGET_BITRATE, with a reliability safety valve.

import type { StreamSource } from "@/lib/nectarine";
import type { StreamReliabilityRow } from "@/lib/streamTelemetry";

export const TARGET_BITRATE = 192;

const rawBitrate = (stream: StreamSource): number => {
  const n = Number(stream?.bitrate);
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

export const isUnreliable = (row: StreamReliabilityRow | undefined): boolean => {
  if (!row) return false;
  const connects = Number(row.connects) || 0;
  const failures = Number(row.failures) || 0;
  if (connects + failures < 5) return false;
  return reliabilityScore(row) < 0.5;
};

export const rankStreams = (
  streams: StreamSource[],
  reliability: Map<string, StreamReliabilityRow>,
  opts: { isMobile: boolean; needsProxy: (url: string) => boolean },
): StreamSource[] => {
  return [...streams].sort((a, b) => {
    if (opts.isMobile) {
      const ap = opts.needsProxy(a.url);
      const bp = opts.needsProxy(b.url);
      if (ap !== bp) return ap ? 1 : -1;
    }

    const ar = reliability.get(a.url);
    const br = reliability.get(b.url);

    const au = isUnreliable(ar);
    const bu = isUnreliable(br);
    if (au !== bu) return au ? 1 : -1;

    const ad = bitrateDistance(a);
    const bd = bitrateDistance(b);
    if (ad !== bd) return ad - bd;

    const abr = Number(rawBitrate(a)) || 0;
    const bbr = Number(rawBitrate(b)) || 0;
    if (abr !== bbr) return bbr - abr;

    return reliabilityScore(br) - reliabilityScore(ar);
  });
};
