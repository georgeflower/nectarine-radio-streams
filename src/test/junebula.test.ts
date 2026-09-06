import { describe, it, expect } from "vitest";
import { getISOWeek, currentJunebulaColor, hexToHslTriplet } from "@/lib/junebula";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("junebula", () => {
  it("2026-09-06 (ISO week 36, Sunday) is DARK RED", () => {
    const date = d("2026-09-06");
    expect(getISOWeek(date)).toBe(36);
    expect(date.getDay()).toBe(0);
    expect(currentJunebulaColor(date)).toEqual({ name: "DARK RED", main: "#8b0000", accent: "#c74444" });
  });

  it("uses the odd-week array on an odd ISO week", () => {
    const date = d("2026-09-13"); // week 37, Sunday
    expect(getISOWeek(date) % 2).toBe(1);
    expect(currentJunebulaColor(date).name).toBe("RED");
  });

  it("Monday is GREEN in either parity", () => {
    expect(currentJunebulaColor(d("2026-09-07")).name).toBe("GREEN"); // odd week
    expect(currentJunebulaColor(d("2026-08-31")).name).toBe("GREEN"); // even week
  });

  it("handles year boundaries per the ISO week port", () => {
    expect(getISOWeek(d("2026-01-01"))).toBe(1);
    expect(getISOWeek(d("2025-12-29"))).toBe(1);
    expect(getISOWeek(d("2027-01-04"))).toBe(1);
  });

  it("converts hex to HSL triplets", () => {
    expect(hexToHslTriplet("#00ff66")).toBe("144 100% 50%");
    expect(hexToHslTriplet("#8b0000")).toBe("0 100% 27.3%");
  });
});
