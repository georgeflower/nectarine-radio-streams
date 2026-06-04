import { describe, expect, it } from "vitest";
import {
  gooseIsRecovered,
  gooseIsTired,
  pickPerchCandidate,
  STAMINA_MAX,
  STAMINA_RECOVER_PER_SECOND,
  STAMINA_RECOVER_THRESHOLD,
  STAMINA_DRAIN_PER_SECOND,
  STAMINA_TIRED_THRESHOLD,
  updateGooseStamina,
  type PerchCandidate,
} from "@/lib/gooseBehavior";

describe("goose perch selection", () => {
  const perches: PerchCandidate<string>[] = [
    { ref: "letter-A", kind: "letter", char: "A", left: 100, top: 120, width: 20 },
    { ref: "window-1", kind: "window", char: "", left: 360, top: 240, width: 140 },
    { ref: "letter-Z", kind: "letter", char: "Z", left: 640, top: 180, width: 24 },
  ];

  it("picks nearest perch by euclidean distance when position is known", () => {
    const nearLeft = pickPerchCandidate(perches, { x: 110, y: 160 });
    const nearWindow = pickPerchCandidate(perches, { x: 420, y: 230 });

    expect(nearLeft?.ref).toBe("letter-A");
    expect(nearWindow?.ref).toBe("window-1");
  });

  it("clamps nearest window landing offset to a stable top-edge range", () => {
    const nearFarLeft = pickPerchCandidate(perches, { x: 0, y: 200 });
    const nearFarRight = pickPerchCandidate(perches, { x: 1000, y: 200 });

    const windowLeft = pickPerchCandidate([
      { ref: "window", kind: "window", char: "", left: 200, top: 200, width: 200 },
    ], { x: 0, y: 220 });
    const windowRight = pickPerchCandidate([
      { ref: "window", kind: "window", char: "", left: 200, top: 200, width: 200 },
    ], { x: 1000, y: 220 });

    expect(nearFarLeft).not.toBeNull();
    expect(nearFarRight).not.toBeNull();
    expect(windowLeft?.offset).toBeCloseTo(0.15, 5);
    expect(windowRight?.offset).toBeCloseTo(0.85, 5);
  });
});

describe("goose stamina", () => {
  it("drains while flying and flags tired threshold", () => {
    const drained = updateGooseStamina(STAMINA_MAX, "fly", 8);
    expect(drained).toBeCloseTo(STAMINA_MAX - STAMINA_DRAIN_PER_SECOND * 8, 5);
    expect(gooseIsTired(STAMINA_TIRED_THRESHOLD - 0.1)).toBe(true);
  });

  it("recovers while perched and caps at maximum", () => {
    const recovered = updateGooseStamina(0, "land", 4);
    expect(recovered).toBeCloseTo(Math.min(STAMINA_MAX, STAMINA_RECOVER_PER_SECOND * 4), 5);
    expect(updateGooseStamina(STAMINA_MAX - 1, "land", 10)).toBe(STAMINA_MAX);
    expect(gooseIsRecovered(STAMINA_RECOVER_THRESHOLD + 0.1)).toBe(true);
  });
});
