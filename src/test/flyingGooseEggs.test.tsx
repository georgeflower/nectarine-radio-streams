import { describe, it, expect } from "vitest";
import {
  hatchDueEggs,
  isHatchWindowValid,
  makeEgg,
  HATCH_MIN_MS,
  HATCH_MAX_MS,
} from "@/lib/gooseLife/eggHatch";

describe("goose egg hatching (non-sim)", () => {
  it("creates eggs whose hatch time is 3 minutes after being laid", () => {
    // Random draws should no longer vary the hatch timing.
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const egg = makeEgg({ id: "e", x: 0, y: 0, laidAt: 1_000, rand: () => r });
      const delta = egg.hatchAt - egg.laidAt;
      expect(delta).toBeGreaterThanOrEqual(HATCH_MIN_MS);
      expect(delta).toBeLessThanOrEqual(HATCH_MAX_MS);
      expect(isHatchWindowValid(egg)).toBe(true);
    }
    expect(HATCH_MIN_MS).toBe(3 * 60_000);
    expect(HATCH_MAX_MS).toBe(3 * 60_000);
  });

  it("does not hatch eggs before their hatchAt timestamp", () => {
    const laidAt = 0;
    const egg = makeEgg({ id: "e1", x: 0, y: 0, laidAt, rand: () => 0 }); // hatchAt = 3m
    const result = hatchDueEggs([egg], laidAt + HATCH_MIN_MS - 1);
    expect(result.hatched).toHaveLength(0);
    expect(result.stillEggs).toHaveLength(1);
  });

  it("hatches every egg once wall-clock time reaches HATCH_MAX_MS", () => {
    const laidAt = 0;
    const eggs = [
      makeEgg({ id: "min", x: 0, y: 0, laidAt, rand: () => 0 }),
      makeEgg({ id: "mid", x: 0, y: 0, laidAt, rand: () => 0.5 }),
      makeEgg({ id: "max", x: 0, y: 0, laidAt, rand: () => 0.999 }),
    ];
    // Just before the minimum: nothing hatches.
    expect(hatchDueEggs(eggs, laidAt + HATCH_MIN_MS - 1).hatched).toHaveLength(0);
    // At the minimum/maximum: all three hatch deterministically.
    expect(hatchDueEggs(eggs, laidAt + HATCH_MIN_MS).hatched.map((e) => e.id).sort()).toEqual(["max", "mid", "min"]);
    const all = hatchDueEggs(eggs, laidAt + HATCH_MAX_MS);
    expect(all.hatched.map((e) => e.id).sort()).toEqual(["max", "mid", "min"]);
    expect(all.stillEggs).toHaveLength(0);
  });

  it("respects the slotsAvailable cap and leaves overflow for the next tick", () => {
    const laidAt = 0;
    const eggs = [
      makeEgg({ id: "a", x: 0, y: 0, laidAt, rand: () => 0 }),
      makeEgg({ id: "b", x: 0, y: 0, laidAt, rand: () => 0 }),
      makeEgg({ id: "c", x: 0, y: 0, laidAt, rand: () => 0 }),
    ];
    const first = hatchDueEggs(eggs, laidAt + HATCH_MAX_MS, 2);
    expect(first.hatched).toHaveLength(2);
    expect(first.stillEggs).toHaveLength(1);
    // Next tick (still past hatch time) clears the leftover.
    const second = hatchDueEggs(first.stillEggs, laidAt + HATCH_MAX_MS, 5);
    expect(second.hatched).toHaveLength(1);
    expect(second.stillEggs).toHaveLength(0);
  });
});
