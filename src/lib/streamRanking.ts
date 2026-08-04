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

export const isShortRunner = (row: StreamReliabilityRow | undefined): boolean => {
  if (!row) return false;
  const connects = Number(row.connects) || 0;
  const failures = Number(row.failures) || 0;
  if (failures < 2 || connects + failures < 3) return false;
  const avg = row.avg_played_sec_before_failure;
  if (avg === null || avg === undefined) return false;
  const n = Number(avg);
  return Number.isFinite(n) && n < SHORT_RUN_SEC;
};

export const isUnreliable = (row: StreamReliabilityRow | undefined): boolean => {
  if (!row) return false;
  if (isShortRunner(row)) return true;
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
    const ap = opts.needsProxy(a.url);
    const bp = opts.needsProxy(b.url);
    // Direct streams beat proxied streams on every platform. A proxy hop is an
    // extra point of failure and is especially fragile under VPNs.
    if (ap !== bp) return ap ? 1 : -1;

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

    const rs = reliabilityScore(br) - reliabilityScore(ar);
    if (rs !== 0) return rs;

    // Final tie-break everywhere: a direct connection beats a proxied hop.
    if (ap !== bp) return ap ? 1 : -1;
    return 0;
  });
};

