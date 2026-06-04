import { describe, expect, it } from "vitest";
import { getEatingLayoutForGoose, getSceneScale } from "@/lib/gooseScene";

describe("flying goose responsive helpers", () => {
  it("scales scene based on viewport minimum dimension", () => {
    expect(getSceneScale(900, 900)).toBeCloseTo(1, 5);
    expect(getSceneScale(450, 1200)).toBeLessThan(1);
    expect(getSceneScale(2000, 1600)).toBeGreaterThan(1);
  });

  it("places two geese side-by-side with food centered between them", () => {
    const ids = [11, 22];
    const left = getEatingLayoutForGoose(11, ids, 1200, 800, 1);
    const right = getEatingLayoutForGoose(22, ids, 1200, 800, 1);
    expect(left.y).toBeCloseTo(right.y, 5);
    expect(left.x).toBeLessThan(left.foodX);
    expect(right.x).toBeGreaterThan(right.foodX);
    expect(left.foodX).toBeCloseTo(right.foodX, 5);
    expect(left.foodY).toBeCloseTo(right.foodY, 5);
  });

  it("keeps food centered for multiple geese", () => {
    const ids = [1, 2, 3];
    const a = getEatingLayoutForGoose(1, ids, 1000, 700, 0.9);
    const b = getEatingLayoutForGoose(2, ids, 1000, 700, 0.9);
    const c = getEatingLayoutForGoose(3, ids, 1000, 700, 0.9);
    expect(a.foodX).toBeCloseTo(b.foodX, 5);
    expect(b.foodX).toBeCloseTo(c.foodX, 5);
    expect(a.foodY).toBeCloseTo(b.foodY, 5);
    expect(b.foodY).toBeCloseTo(c.foodY, 5);
  });
});
