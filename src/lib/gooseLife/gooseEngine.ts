import { chooseNextBehavior, nextBehaviorAt } from "./behaviorSystem";
import { ageFromBirth, HOUR_MS, LIFESPAN_HOURS } from "./timeEngine";
import type { Egg, Goose, GooseLifeState, StageBounds } from "./types";

const NAMES = [
  "Raster",
  "Copper",
  "Plasma",
  "Tracker",
  "VBlank",
  "Paula",
  "Bitplane",
  "Sid",
  "Pixel",
  "Blitter",
];

const DEFAULT_STAGE: StageBounds = { width: 1280, height: 720 };

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const randomPersonality = (): Goose["personality"] => {
  const picks: Goose["personality"][] = ["calm", "bold", "playful", "curious"];
  return picks[Math.floor(Math.random() * picks.length)];
};

function randomName(used: Set<string>): string {
  const available = NAMES.filter((name) => !used.has(name));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${Math.floor(Math.random() * 100)}`;
}

function createGoose(now: number, stage: StageBounds, seed: Partial<Goose>): Goose {
  const margin = 40;
  const x = randomBetween(margin, Math.max(margin + 1, stage.width - margin));
  const y = randomBetween(margin, Math.max(margin + 1, stage.height - margin));
  const angle = randomBetween(0, Math.PI * 2);
  const speed = randomBetween(22, 42);
  return {
    id: seed.id ?? crypto.randomUUID(),
    name: seed.name ?? "Goose",
    sex: seed.sex ?? "female",
    ageHours: seed.ageHours ?? 0,
    birthTimestamp: seed.birthTimestamp ?? now,
    alive: seed.alive ?? true,
    mood: seed.mood ?? "neutral",
    state: seed.state ?? "idle",
    position: seed.position ?? { x, y },
    velocity: seed.velocity ?? { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    relationships: seed.relationships ?? {},
    pregnant: seed.pregnant,
    eggs: seed.eggs ?? [],
    personality: seed.personality ?? randomPersonality(),
    speedModifier: seed.speedModifier ?? randomBetween(0.8, 1.2),
    paletteShift: seed.paletteShift ?? Math.floor(randomBetween(-25, 25)),
    targetId: seed.targetId,
    nextBehaviorAt: seed.nextBehaviorAt ?? nextBehaviorAt(now),
    pregnancyUntil: seed.pregnancyUntil,
    mournUntil: seed.mournUntil,
    deathAt: seed.deathAt,
    funeralEndsAt: seed.funeralEndsAt,
    bodyFadeStartAt: seed.bodyFadeStartAt,
    bodyRemoved: seed.bodyRemoved ?? false,
    parentIds: seed.parentIds,
  };
}

export function createInitialGooseLifeState(now = Date.now(), stage: StageBounds = DEFAULT_STAGE): GooseLifeState {
  const used = new Set<string>();
  const femaleName = randomName(used);
  used.add(femaleName);
  const maleName = randomName(used);
  const female = createGoose(now, stage, { name: femaleName, sex: "female", mood: "happy", state: "waddle" });
  const male = createGoose(now, stage, { name: maleName, sex: "male", mood: "playful", state: "fly" });
  female.relationships[male.id] = 50;
  male.relationships[female.id] = 50;

  return {
    geese: [female, male],
    accumulatedOpenMs: 0,
    lastTickAt: now,
    lastReproductionAt: now,
    processedOnelinerKey: null,
  };
}

function applyMovement(goose: Goose, dtSeconds: number, stage: StageBounds, geese: Goose[]): Goose {
  if (!goose.alive) return goose;
  const next = { ...goose, position: { ...goose.position }, velocity: { ...goose.velocity } };

  if (next.state === "sleep" || next.state === "mourn") {
    next.velocity.x *= 0.92;
    next.velocity.y *= 0.92;
  }

  if (next.state === "follow" && next.parentIds?.length) {
    const parent = geese.find((g) => g.id === next.parentIds?.[0] || g.id === next.parentIds?.[1]);
    if (parent) {
      next.velocity.x += (parent.position.x - next.position.x) * 0.6 * dtSeconds;
      next.velocity.y += (parent.position.y - next.position.y) * 0.6 * dtSeconds;
    }
  }

  const maxSpeed = 70 * next.speedModifier;
  const speed = Math.hypot(next.velocity.x, next.velocity.y);
  if (speed > maxSpeed) {
    next.velocity.x = (next.velocity.x / speed) * maxSpeed;
    next.velocity.y = (next.velocity.y / speed) * maxSpeed;
  }

  next.position.x += next.velocity.x * dtSeconds;
  next.position.y += next.velocity.y * dtSeconds;

  if (next.position.x < 20 || next.position.x > stage.width - 20) {
    next.velocity.x *= -1;
    next.position.x = clamp(next.position.x, 20, Math.max(20, stage.width - 20));
  }
  if (next.position.y < 40 || next.position.y > stage.height - 30) {
    next.velocity.y *= -1;
    next.position.y = clamp(next.position.y, 40, Math.max(40, stage.height - 30));
  }

  return next;
}

function maybeDie(goose: Goose, now: number): Goose {
  if (!goose.alive) {
    if (goose.funeralEndsAt && now >= goose.funeralEndsAt) {
      return {
        ...goose,
        bodyFadeStartAt: goose.bodyFadeStartAt ?? goose.funeralEndsAt,
        bodyRemoved: now - goose.funeralEndsAt > 20_000,
      };
    }
    return goose;
  }

  const deadByAge = goose.ageHours >= LIFESPAN_HOURS;
  const randomSleepDeath = goose.state === "sleep" && Math.random() < 0.0000018;
  if (!deadByAge && !randomSleepDeath) return goose;

  const funeralEndsAt = now + 10 * 60_000;
  return {
    ...goose,
    alive: false,
    mood: "mourning",
    state: "mourn",
    deathAt: now,
    funeralEndsAt,
    bodyFadeStartAt: funeralEndsAt,
    velocity: { x: 0, y: 0 },
  };
}

function updateReproduction(state: GooseLifeState, now: number, stage: StageBounds): GooseLifeState {
  const geese = state.geese.map((goose) => ({ ...goose, relationships: { ...goose.relationships }, eggs: [...(goose.eggs ?? [])] }));

  const livingAdults = geese.filter((g) => g.alive && g.ageHours > 6 && g.mood !== "mourning");
  const females = livingAdults.filter((g) => g.sex === "female");
  const males = livingAdults.filter((g) => g.sex === "male");

  for (const female of females) {
    if (!female.pregnant) {
      const mate = males.find((male) => {
        const affinity = female.relationships[male.id] ?? 40;
        const proximity = Math.hypot(female.position.x - male.position.x, female.position.y - male.position.y);
        return affinity >= 60 && proximity < 170;
      });
      if (mate && now - state.lastReproductionAt > 45_000 && Math.random() < 0.0045) {
        female.pregnant = true;
        female.pregnancyUntil = now + HOUR_MS;
        female.mood = "happy";
        female.state = "interact";
        female.targetId = mate.id;
        mate.relationships[female.id] = (mate.relationships[female.id] ?? 60) + 3;
        female.relationships[mate.id] = (female.relationships[mate.id] ?? 60) + 3;
      }
    }

    if (female.pregnant && female.pregnancyUntil && now >= female.pregnancyUntil) {
      female.pregnant = false;
      female.pregnancyUntil = undefined;
      const eggCount = 1 + Math.floor(Math.random() * 3);
      const eggs: Egg[] = Array.from({ length: eggCount }, () => ({ laidAt: now, hatchAfterHours: 4 }));
      female.eggs = [...(female.eggs ?? []), ...eggs];
      female.state = "idle";
    }

    const hatchable = (female.eggs ?? []).filter((egg) => now - egg.laidAt >= egg.hatchAfterHours * HOUR_MS);
    if (hatchable.length > 0) {
      const father = females.length + males.length > 1
        ? geese.find((g) => g.id === female.targetId && g.sex === "male" && g.alive) ?? males[0]
        : undefined;
      female.eggs = (female.eggs ?? []).filter((egg) => now - egg.laidAt < egg.hatchAfterHours * HOUR_MS);
      for (const _ of hatchable) {
        geese.push(
          createGoose(now, stage, {
            name: randomName(new Set(geese.map((g) => g.name))),
            sex: Math.random() < 0.5 ? "male" : "female",
            ageHours: 0,
            birthTimestamp: now,
            mood: "playful",
            state: "follow",
            speedModifier: randomBetween(0.7, 1.15),
            paletteShift: Math.floor(randomBetween(-40, 40)),
            parentIds: father ? [female.id, father.id] : [female.id],
          }),
        );
      }
    }
  }

  return { ...state, geese, lastReproductionAt: now };
}

function applySocialInteraction(geese: Goose[]) {
  for (let i = 0; i < geese.length; i++) {
    for (let j = i + 1; j < geese.length; j++) {
      const a = geese[i];
      const b = geese[j];
      if (!a.alive || !b.alive) continue;
      const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      if (d < 100) {
        a.relationships[b.id] = (a.relationships[b.id] ?? 40) + 0.06;
        b.relationships[a.id] = (b.relationships[a.id] ?? 40) + 0.06;
        if (a.state === "interact" || b.state === "interact") {
          a.mood = a.mood === "mourning" ? "mourning" : "happy";
          b.mood = b.mood === "mourning" ? "mourning" : "happy";
        }
      }
    }
  }
}

function updateFuneralMourning(geese: Goose[], now: number): { geese: Goose[]; funeralPulseUntil?: number } {
  const deadWithFuneral = geese.find((g) => g.deathAt && g.funeralEndsAt && now < g.funeralEndsAt);
  if (!deadWithFuneral) {
    return {
      geese: geese.map((g) =>
        g.alive && g.mood === "mourning" && g.mournUntil && now >= g.mournUntil
          ? { ...g, mood: "sad", state: g.state === "mourn" ? "idle" : g.state, mournUntil: undefined }
          : g,
      ),
      funeralPulseUntil: undefined,
    };
  }

  const mournUntil = now + 10 * 60_000;
  const updated = geese.map((goose) => {
    if (!goose.alive) return goose;
    return {
      ...goose,
      mood: "mourning" as const,
      state: "mourn" as const,
      mournUntil,
      velocity: {
        x: (deadWithFuneral.position.x - goose.position.x) * 0.03,
        y: (deadWithFuneral.position.y - goose.position.y) * 0.03,
      },
    };
  });
  return { geese: updated, funeralPulseUntil: deadWithFuneral.funeralEndsAt };
}

export function stepGooseLife(
  state: GooseLifeState,
  now: number,
  dtMs: number,
  stage: StageBounds,
): GooseLifeState {
  const dtSeconds = Math.max(0, Math.min(0.25, dtMs / 1000));
  const safeStage: StageBounds = {
    width: Math.max(320, stage.width || DEFAULT_STAGE.width),
    height: Math.max(220, stage.height || DEFAULT_STAGE.height),
  };

  let geese = state.geese.map((original) => {
    let goose = { ...original, relationships: { ...original.relationships }, eggs: [...(original.eggs ?? [])] };
    goose.ageHours = ageFromBirth(goose.birthTimestamp, now);
    goose = maybeDie(goose, now);

    if (!goose.alive) return goose;

    if (goose.mournUntil && now >= goose.mournUntil && goose.mood === "mourning") {
      goose.mood = "sad";
      goose.state = "idle";
      goose.mournUntil = undefined;
    }

    if (now >= goose.nextBehaviorAt) {
      const nearbyCount = state.geese.filter(
        (other) => other.id !== goose.id && other.alive && Math.hypot(other.position.x - goose.position.x, other.position.y - goose.position.y) < 180,
      ).length;
      goose.state = chooseNextBehavior(goose, nearbyCount);
      goose.nextBehaviorAt = nextBehaviorAt(now);

      const angle = randomBetween(0, Math.PI * 2);
      const speed = (goose.state === "fly" ? 65 : goose.state === "sleep" ? 5 : 28) * goose.speedModifier;
      goose.velocity = {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      };
    }

    return applyMovement(goose, dtSeconds, safeStage, state.geese);
  });

  applySocialInteraction(geese);
  const mourningUpdate = updateFuneralMourning(geese, now);
  geese = mourningUpdate.geese;

  const nextState = updateReproduction(
    {
      ...state,
      geese,
      accumulatedOpenMs: state.accumulatedOpenMs + dtMs,
      lastTickAt: now,
    },
    now,
    safeStage,
  );

  return {
    ...nextState,
    funeralPulseUntil: mourningUpdate.funeralPulseUntil,
  };
}
