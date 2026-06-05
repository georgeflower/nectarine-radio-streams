import { describe, expect, it, vi } from "vitest";
import { HOUR_MS, LIFESPAN_HOURS, maybeApplyLatestOneliner, stepGooseLife, type Goose, type GooseLifeState } from "@/lib/gooseLife";

const STAGE = { width: 1280, height: 720 };
const MOURNING_DURATION_MS = 10 * 60_000;

function makeGoose(now: number, seed: Partial<Goose>): Goose {
  return {
    id: seed.id ?? `goose-${Math.random()}`,
    name: seed.name ?? "Goose",
    sex: seed.sex ?? "female",
    ageHours: seed.ageHours ?? 0,
    birthTimestamp: seed.birthTimestamp ?? now,
    alive: seed.alive ?? true,
    mood: seed.mood ?? "neutral",
    state: seed.state ?? "idle",
    position: seed.position ?? { x: 400, y: 300 },
    velocity: seed.velocity ?? { x: 0, y: 0 },
    relationships: seed.relationships ?? {},
    eggs: seed.eggs ?? [],
    personality: seed.personality ?? "calm",
    speedModifier: seed.speedModifier ?? 1,
    paletteShift: seed.paletteShift ?? 0,
    nextBehaviorAt: seed.nextBehaviorAt ?? now + 1_000_000,
    pregnant: seed.pregnant,
    pregnancyUntil: seed.pregnancyUntil,
    mournUntil: seed.mournUntil,
    deathAt: seed.deathAt,
    funeralEndsAt: seed.funeralEndsAt,
    bodyFadeStartAt: seed.bodyFadeStartAt,
    bodyRemoved: seed.bodyRemoved ?? false,
    targetId: seed.targetId,
    parentIds: seed.parentIds,
  };
}

function makeState(now: number, geese: Goose[], lastReproductionAt = now): GooseLifeState {
  return {
    geese,
    accumulatedOpenMs: 0,
    lastTickAt: now,
    lastReproductionAt,
    processedOnelinerKey: null,
  };
}

describe("gooseLife core invariants", () => {
  it("keeps lastReproductionAt unchanged when no reproduction occurs", () => {
    const now = 1_000_000;
    const female = makeGoose(now, {
      id: "female",
      sex: "female",
      birthTimestamp: now - 8 * HOUR_MS,
      relationships: {},
    });
    const initialLastReproductionAt = now - 30_000;
    const state = makeState(now, [female], initialLastReproductionAt);

    const next = stepGooseLife(state, now + 1_000, 16, STAGE);

    expect(next.lastReproductionAt).toBe(initialLastReproductionAt);
  });

  it("enforces reproduction cooldown before allowing pregnancy", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const now = 2_000_000;
    const female = makeGoose(now, {
      id: "female",
      sex: "female",
      birthTimestamp: now - 8 * HOUR_MS,
      relationships: { male: 90 },
      position: { x: 320, y: 250 },
    });
    const male = makeGoose(now, {
      id: "male",
      sex: "male",
      birthTimestamp: now - 9 * HOUR_MS,
      relationships: { female: 90 },
      position: { x: 360, y: 250 },
    });

    const blocked = stepGooseLife(makeState(now, [female, male], now - 10_000), now, 16, STAGE);
    expect(blocked.geese.find((g) => g.id === "female")?.pregnant).not.toBe(true);

    const allowedNow = now + 50_000;
    const allowed = stepGooseLife(makeState(now, [female, male], now - 60_000), allowedNow, 16, STAGE);
    expect(allowed.geese.find((g) => g.id === "female")?.pregnant).toBe(true);
    expect(allowed.lastReproductionAt).toBe(allowedNow);

    randomSpy.mockRestore();
  });

  it("hatches eggs into follow-state goslings", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const now = 3_000_000;
    const female = makeGoose(now, {
      id: "female",
      sex: "female",
      birthTimestamp: now - 12 * HOUR_MS,
      targetId: "male",
      eggs: [{ laidAt: now - 4 * HOUR_MS, hatchAfterHours: 4 }],
    });
    const male = makeGoose(now, {
      id: "male",
      sex: "male",
      birthTimestamp: now - 12 * HOUR_MS,
    });
    const state = makeState(now, [female, male], now);

    const next = stepGooseLife(state, now + 1_000, 16, STAGE);
    const goslings = next.geese.filter((g) => g.parentIds?.[0] === "female");

    expect(goslings).toHaveLength(1);
    expect(goslings[0].state).toBe("follow");
    expect(goslings[0].parentIds).toEqual(["female", "male"]);
    expect(next.geese.find((g) => g.id === "female")?.eggs).toHaveLength(0);

    randomSpy.mockRestore();
  });

  it("keeps goslings grounded even when marked as flying", () => {
    const now = 3_500_000;
    const gosling = makeGoose(now, {
      id: "gosling",
      ageHours: 1,
      state: "fly",
      isGosling: true,
      parentIds: ["female"],
      velocity: { x: 220, y: -120 },
      position: { x: 420, y: 220 },
      nextBehaviorAt: now + 10_000,
    });
    const mother = makeGoose(now, {
      id: "female",
      sex: "female",
      ageHours: 12,
      position: { x: 430, y: 620 },
      velocity: { x: 40, y: 0 },
      state: "waddle",
    });

    const next = stepGooseLife(makeState(now, [mother, gosling]), now + 200, 16, STAGE);
    const updated = next.geese.find((g) => g.id === "gosling");
    expect(updated?.state).not.toBe("fly");
    expect((updated?.position.y ?? 0)).toBeGreaterThanOrEqual(STAGE.height * 0.8);
  });

  it("moves sleeping geese toward perch targets", () => {
    const now = 3_700_000;
    const sleeper = makeGoose(now, {
      id: "sleepy",
      state: "sleep",
      ageHours: 12,
      position: { x: 640, y: 690 },
      velocity: { x: 0, y: 0 },
      nextBehaviorAt: now + 60_000,
    });
    const stageWithPerch = {
      ...STAGE,
      perches: [{ x: 640, y: 480, kind: "window" as const }],
    };

    const next = stepGooseLife(makeState(now, [sleeper]), now + 800, 800, stageWithPerch);
    const updated = next.geese.find((g) => g.id === "sleepy");
    expect(updated?.position.y ?? 999).toBeLessThan(690);
    expect(updated?.perchTarget?.kind).toBe("window");
  });

  it("marks geese dead when they reach lifespan", () => {
    const now = 4_000_000;
    const elder = makeGoose(now, {
      id: "elder",
      birthTimestamp: now - LIFESPAN_HOURS * HOUR_MS,
      state: "waddle",
    });

    const next = stepGooseLife(makeState(now, [elder]), now, 16, STAGE);
    const dead = next.geese.find((g) => g.id === "elder");

    expect(dead?.alive).toBe(false);
    expect(dead?.state).toBe("mourn");
    expect(dead?.deathAt).toBe(now);
  });

  it("sets mourning during funeral and clears it afterwards", () => {
    const now = 5_000_000;
    const dead = makeGoose(now, {
      id: "dead",
      alive: false,
      mood: "mourning",
      state: "mourn",
      birthTimestamp: now - 10 * HOUR_MS,
      deathAt: now - 1_000,
      funeralEndsAt: now + 5_000,
    });
    const living = makeGoose(now, {
      id: "living",
      sex: "female",
      birthTimestamp: now - 10 * HOUR_MS,
      mood: "neutral",
      state: "idle",
    });

    const duringFuneral = stepGooseLife(makeState(now, [dead, living]), now, 16, STAGE);
    const mourningGoose = duringFuneral.geese.find((g) => g.id === "living");
    expect(mourningGoose?.mood).toBe("mourning");
    expect(mourningGoose?.mournUntil).toBe(now + MOURNING_DURATION_MS);

    const afterFuneral = stepGooseLife(duringFuneral, now + MOURNING_DURATION_MS + 10_000, 16, STAGE);
    const recovered = afterFuneral.geese.find((g) => g.id === "living");
    expect(recovered?.mood).toBe("sad");
    expect(recovered?.state).toBe("idle");
    expect(recovered?.mournUntil).toBeUndefined();
  });

  it("uses tick time for oneliner-triggered mourning", () => {
    const now = 6_000_000;
    const goose = makeGoose(now, { id: "target", name: "Raster" });
    const state = makeState(now, [goose]);

    const next = maybeApplyLatestOneliner(state, "rip Raster", "one", now + 1234);
    const reacted = next.geese.find((g) => g.id === "target");
    expect(reacted?.mournUntil).toBe(now + 1234 + MOURNING_DURATION_MS);
  });
});
