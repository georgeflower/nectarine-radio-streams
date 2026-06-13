import { describe, expect, it } from "vitest";
import {
  dpBeats,
  fuseBandEnvelopes,
  pickTempo,
  spectralNovelty,
  whitenInPlace,
} from "@/lib/bpm/tempogram";

function synthEnvelope(bpm: number, frameMs: number, seconds: number, weakDownbeat = false) {
  const n = Math.round((seconds * 1000) / frameMs);
  const env = new Float32Array(n);
  const periodFrames = (60_000 / bpm) / frameMs;
  for (let i = 0; i < n; i++) {
    const pos = i / periodFrames;
    const nearest = Math.round(pos);
    const dist = Math.abs(pos - nearest);
    // Narrow gaussian impulse near each beat.
    const amp = Math.exp(-(dist * dist) / 0.005);
    // Optionally make downbeats no stronger than offbeats (challenge case).
    const accent = weakDownbeat ? 1 : nearest % 4 === 0 ? 1.4 : 1;
    env[i] = amp * accent + Math.random() * 0.05;
  }
  return env;
}

describe("pickTempo", () => {
  it("locks 90 BPM within ±2", () => {
    const env = synthEnvelope(90, 12, 10);
    whitenInPlace(env);
    const t = pickTempo(env, 12);
    expect(t).not.toBeNull();
    expect(Math.abs((t?.bpm ?? 0) - 90)).toBeLessThan(2);
  });

  it("locks 128 BPM within ±2", () => {
    const env = synthEnvelope(128, 12, 10);
    whitenInPlace(env);
    const t = pickTempo(env, 12);
    expect(t).not.toBeNull();
    expect(Math.abs((t?.bpm ?? 0) - 128)).toBeLessThan(2);
  });

  it("locks 174 BPM within ±3 (without relying on strong downbeat)", () => {
    const env = synthEnvelope(174, 12, 10, true);
    whitenInPlace(env);
    const t = pickTempo(env, 12);
    expect(t).not.toBeNull();
    // Accept either 174 or its octave 87 due to no downbeat, but ensure
    // the family is correct.
    const bpm = t?.bpm ?? 0;
    const ok = Math.abs(bpm - 174) < 3 || Math.abs(bpm - 87) < 3;
    expect(ok).toBe(true);
  });
});

describe("dpBeats", () => {
  it("returns roughly the right number of beats", () => {
    const env = synthEnvelope(120, 12, 8);
    whitenInPlace(env);
    const periodFrames = (60_000 / 120) / 12;
    const beats = dpBeats(env, periodFrames);
    // 8 seconds at 120 BPM ≈ 16 beats.
    expect(beats.length).toBeGreaterThan(12);
    expect(beats.length).toBeLessThan(20);
  });
});

describe("spectralNovelty", () => {
  it("is low for repeated spectra and rises on spectral change", () => {
    const prev = new Float32Array(8);
    const a = new Float32Array([1, 2, 3, 4, 3, 2, 1, 0.5]);
    const b = new Float32Array([0.3, 0.2, 0.4, 0.5, 2, 3, 4, 5]);

    const first = spectralNovelty(a, prev);
    const repeated = spectralNovelty(a, prev);
    const changed = spectralNovelty(b, prev);

    expect(first).toBeGreaterThan(0.1);
    expect(repeated).toBeLessThan(0.05);
    expect(changed).toBeGreaterThan(repeated + 0.25);
  });
});

describe("fuseBandEnvelopes", () => {
  it("respects adaptive feature weights", () => {
    const a = new Float32Array([1, 1, 1]);
    const b = new Float32Array([5, 5, 5]);
    const equal = fuseBandEnvelopes([a, b]);
    const weighted = fuseBandEnvelopes([a, b], new Float32Array([1, 3]));

    expect(equal.fused[0]).toBeCloseTo(3, 5);
    expect(weighted.fused[0]).toBeCloseTo(4, 5);
  });
});
