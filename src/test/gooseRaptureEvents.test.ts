import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureRaptureSpeaker,
  notePlatformChange,
  noteRaptureOnelinerIfMatch,
  startRaptureRoutine,
  stopRaptureRoutine,
  __testing,
} from "@/lib/gooseRaptureEvents";

type Call = { who: "white" | "brown"; text: string };

function makeSpeaker(pair = true) {
  const calls: Call[] = [];
  configureRaptureSpeaker({
    sayWhite: (text) => calls.push({ who: "white", text }),
    sayBrown: (text) => calls.push({ who: "brown", text }),
    hasPair: () => pair,
  });
  return calls;
}

beforeEach(() => {
  vi.useFakeTimers();
  __testing.reset();
});
afterEach(() => {
  stopRaptureRoutine();
  configureRaptureSpeaker(null);
  vi.useRealTimers();
});

describe("amiga / atari platform banter", () => {
  it("fires white then brown for an Amiga track", () => {
    const calls = makeSpeaker();
    notePlatformChange("Amiga", "t1|a1");
    vi.advanceTimersByTime(1500);
    expect(calls).toEqual([
      { who: "white", text: "AMIGAAAAAA!" },
      { who: "brown", text: "ATARIIIII!" },
    ]);
  });

  it("fires brown then white for an Atari track", () => {
    const calls = makeSpeaker();
    notePlatformChange("Atari ST", "t1|a1");
    vi.advanceTimersByTime(1500);
    expect(calls.map((c) => c.who)).toEqual(["brown", "white"]);
  });

  it("skips every second consecutive same-platform track", () => {
    const calls = makeSpeaker();
    notePlatformChange("Amiga", "t1|a1");
    vi.advanceTimersByTime(1500);
    notePlatformChange("Amiga", "t2|a2"); // skipped
    vi.advanceTimersByTime(1500);
    notePlatformChange("Amiga", "t3|a3"); // fires
    vi.advanceTimersByTime(1500);
    const whites = calls.filter((c) => c.text === "AMIGAAAAAA!").length;
    expect(whites).toBe(2);
  });

  it("resets the streak when the other platform plays", () => {
    const calls = makeSpeaker();
    notePlatformChange("Amiga", "t1|a1");
    vi.advanceTimersByTime(1500);
    notePlatformChange("Atari", "t2|a2");
    vi.advanceTimersByTime(1500);
    notePlatformChange("Amiga", "t3|a3"); // fires (streak reset)
    vi.advanceTimersByTime(1500);
    const amigaFires = calls.filter((c) => c.text === "AMIGAAAAAA!" && c.who === "white").length;
    expect(amigaFires).toBe(2);
  });
});

describe("rapture oneliner reaction", () => {
  it("emits scream and suppresses repeats for 60 minutes", () => {
    const calls = makeSpeaker();
    noteRaptureOnelinerIfMatch("Rapture");
    vi.advanceTimersByTime(2000);
    expect(calls.map((c) => c.text)).toEqual(["Rapture! <3", "Daddy!", "Mommy!"]);

    calls.length = 0;
    vi.advanceTimersByTime(30 * 60_000);
    noteRaptureOnelinerIfMatch("rapture");
    vi.advanceTimersByTime(2000);
    expect(calls).toEqual([]);

    vi.advanceTimersByTime(31 * 60_000);
    noteRaptureOnelinerIfMatch("Rapture");
    vi.advanceTimersByTime(2000);
    expect(calls.length).toBe(3);
  });

  it("ignores non-Rapture usernames", () => {
    const calls = makeSpeaker();
    noteRaptureOnelinerIfMatch("Bob");
    vi.advanceTimersByTime(2000);
    expect(calls).toEqual([]);
  });
});

describe("10-minute Rapture routine", () => {
  it("plays the three-line exchange on each interval", () => {
    const calls = makeSpeaker();
    startRaptureRoutine();
    vi.advanceTimersByTime(__testing.RAPTURE_INTERVAL_MS + 5000);
    expect(calls.map((c) => c.text)).toEqual([
      "Have you seen Rapture?",
      "No :(",
      "keep looking!",
    ]);
  });

  it("is suppressed for 60 minutes after a Rapture oneliner", () => {
    const calls = makeSpeaker();
    noteRaptureOnelinerIfMatch("Rapture");
    vi.advanceTimersByTime(2000);
    calls.length = 0;
    startRaptureRoutine();
    vi.advanceTimersByTime(__testing.RAPTURE_INTERVAL_MS + 5000);
    expect(calls).toEqual([]);
  });
});
