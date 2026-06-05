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
const REPRODUCTION_COOLDOWN_MS = 45_000;
const REPRODUCTION_TICK_CHANCE = 0.0045;
const SLEEP_DEATH_CHANCE_PER_HOUR = 0.00035;
const SPEED_MULTIPLIER = 4;
const LOWER_BAND_RATIO = 0.8;
const FOLLOW_SPACING = 30;
const FOLLOW_LATERAL_SPACING = 12;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const randomPersonality = (): Goose["personality"] => {
  const picks: Goose["personality"][] = ["calm", "bold", "playful", "curious"];
  return picks[Math.floor(Math.random() * picks.length)];
};

function randomName(used: Set<string>): string {
  const available = NAMES.filter((name) => !used.has(name));
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
  return `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${Math.floor(Math.random() * 100)}`;
}

function isGosling(goose: Goose) {
  return !!goose.isGosling || (!!goose.parentIds && goose.ageHours < 6);
}

function canFly(goose: Goose) {
  return !isGosling(goose) && goose.alive;
}

function floorY(stage: StageBounds) {
  return stage.height * LOWER_BAND_RATIO;
}

function choosePerch(stage: StageBounds, goose: Goose) {
  const perches = stage.perches ?? [];
  if (perches.length === 0) return { x: goose.position.x, y: floorY(stage), kind: "floor" as const };
  let best = perches[Math.floor(Math.random() * perches.length)];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const perch of perches) {
    const distance = Math.hypot(perch.x - goose.position.x, perch.y - goose.position.y);
    const score = distance + Math.random() * 24;
    if (score < bestScore) {
      best = perch;
      bestScore = score;
    }
  }
  return best;
}

function createGoose(now: number, stage: StageBounds, seed: Partial<Goose>): Goose {
  const margin = 40;
  const x = randomBetween(margin, Math.max(margin + 1, stage.width - margin));
  const baseY = seed.state === "fly" ? randomBetween(margin, Math.max(margin + 1, stage.height * 0.65)) : randomBetween(stage.height * 0.82, Math.max(stage.height * 0.92, stage.height - margin));
  const y = seed.position?.y ?? clamp(baseY, margin, stage.height - margin);
  const angle = randomBetween(0, Math.PI * 2);
  const speed = randomBetween(22, 42) * SPEED_MULTIPLIER;
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
    isGosling: seed.isGosling ?? false,
    followIndex: seed.followIndex,
    perchTarget: seed.perchTarget,
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

function constrainToBounds(goose: Goose, stage: StageBounds) {
  const next = goose;
  const minX = 20;
  const maxX = Math.max(20, stage.width - 20);
  const minY = 40;
  const flyMaxY = Math.max(minY + 20, stage.height * 0.74);
  const groundMinY = floorY(stage);
  const maxY = Math.max(groundMinY + 10, stage.height - 24);
  const canGoFly = canFly(next) && (next.state === "fly" || next.state === "play");

  if (next.position.x < minX || next.position.x > maxX) {
    next.velocity.x *= -1;
    next.position.x = clamp(next.position.x, minX, maxX);
  }

  if (canGoFly) {
    if (next.position.y < minY || next.position.y > flyMaxY) {
      next.velocity.y *= -1;
      next.position.y = clamp(next.position.y, minY, flyMaxY);
    }
    return next;
  }

  next.position.y = clamp(next.position.y, groundMinY, maxY);
  if (next.position.y >= maxY && next.velocity.y > 0) next.velocity.y *= -0.45;
  if (next.position.y <= groundMinY && next.velocity.y < 0) next.velocity.y *= -0.45;
  return next;
}

function applyPerchState(goose: Goose, dtSeconds: number, stage: StageBounds): Goose {
  const next = { ...goose, position: { ...goose.position }, velocity: { ...goose.velocity } };
  const perch = next.perchTarget ?? choosePerch(stage, next);
  next.perchTarget = perch;
  const dx = perch.x - next.position.x;
  const dy = perch.y - next.position.y;
  const distance = Math.hypot(dx, dy);
  const settleSpeed = (next.state === "sleep" ? 70 : 120) * SPEED_MULTIPLIER;
  if (distance > 2) {
    const step = Math.min(distance, settleSpeed * dtSeconds);
    next.position.x += (dx / Math.max(1, distance)) * step;
    next.position.y += (dy / Math.max(1, distance)) * step;
  }
  next.velocity.x *= 0.68;
  next.velocity.y *= 0.68;
  return constrainToBounds(next, stage);
}

function applyFollowState(goose: Goose, geese: Goose[], dtSeconds: number, stage: StageBounds): Goose {
  const next = { ...goose, position: { ...goose.position }, velocity: { ...goose.velocity } };
  const parentCandidates = geese.filter((g) =>
    g.alive && !isGosling(g) && (g.id === goose.parentIds?.[0] || g.id === goose.parentIds?.[1]),
  );
  const mother = parentCandidates.find((g) => g.sex === "female") ?? parentCandidates[0];
  if (!mother) return applyPerchState(next, dtSeconds, stage);

  const siblings = geese
    .filter((g) => g.parentIds?.[0] === mother.id && isGosling(g) && g.alive)
    .sort((a, b) => a.birthTimestamp - b.birthTimestamp || a.id.localeCompare(b.id));
  const index = Math.max(0, siblings.findIndex((g) => g.id === goose.id));
  next.followIndex = index;

  const heading = Math.atan2(mother.velocity.y, mother.velocity.x || 0.0001);
  const facing = Number.isFinite(heading) ? heading : 0;
  const backX = Math.cos(facing + Math.PI);
  const backY = Math.sin(facing + Math.PI);
  const sideX = Math.cos(facing + Math.PI / 2);
  const sideY = Math.sin(facing + Math.PI / 2);
  const lineStep = index + 1;
  const lateral = ((index % 2 === 0 ? -1 : 1) * Math.floor((index + 1) / 2)) * FOLLOW_LATERAL_SPACING;
  const target = {
    x: mother.position.x + backX * FOLLOW_SPACING * lineStep + sideX * lateral,
    y: Math.max(floorY(stage), mother.position.y + backY * FOLLOW_SPACING * lineStep + sideY * lateral),
  };

  const dx = target.x - next.position.x;
  const dy = target.y - next.position.y;
  const distance = Math.hypot(dx, dy);
  const followSpeed = 95 * SPEED_MULTIPLIER * next.speedModifier;
  if (distance > 1) {
    next.velocity.x += (dx / Math.max(1, distance)) * followSpeed * dtSeconds * 2;
    next.velocity.y += (dy / Math.max(1, distance)) * followSpeed * dtSeconds * 2;
  }
  next.velocity.x *= 0.89;
  next.velocity.y *= 0.82;

  const speed = Math.hypot(next.velocity.x, next.velocity.y);
  const maxSpeed = followSpeed;
  if (speed > maxSpeed) {
    next.velocity.x = (next.velocity.x / speed) * maxSpeed;
    next.velocity.y = (next.velocity.y / speed) * maxSpeed;
  }

  next.position.x += next.velocity.x * dtSeconds;
  next.position.y += next.velocity.y * dtSeconds;
  return constrainToBounds(next, stage);
}

function applyPlayState(goose: Goose, geese: Goose[], dtSeconds: number, stage: StageBounds): Goose {
  const next = { ...goose, position: { ...goose.position }, velocity: { ...goose.velocity } };
  const goslings = geese.filter((g) => g.alive && isGosling(g));
  if (goslings.length === 0 || isGosling(next)) {
    next.state = isGosling(next) ? "follow" : "waddle";
    return applyMovement(next, dtSeconds, stage, geese);
  }

  const target = goslings.reduce((best, g) => {
    const d = Math.hypot(g.position.x - next.position.x, g.position.y - next.position.y);
    if (!best || d < best.distance) return { goose: g, distance: d };
    return best;
  }, null as { goose: Goose; distance: number } | null)?.goose;
  if (!target) return applyMovement(next, dtSeconds, stage, geese);

  const dx = target.position.x - next.position.x;
  const dy = target.position.y - next.position.y;
  const distance = Math.hypot(dx, dy);
  const groundedChase = distance < 170;
  const chaseSpeed = (groundedChase ? 95 : 135) * SPEED_MULTIPLIER * next.speedModifier;
  next.velocity.x += (dx / Math.max(1, distance)) * chaseSpeed * dtSeconds;
  next.velocity.y += (dy / Math.max(1, distance)) * chaseSpeed * dtSeconds;

  if (groundedChase) next.position.y = Math.max(next.position.y, floorY(stage));

  const speed = Math.hypot(next.velocity.x, next.velocity.y);
  if (speed > chaseSpeed) {
    next.velocity.x = (next.velocity.x / speed) * chaseSpeed;
    next.velocity.y = (next.velocity.y / speed) * chaseSpeed;
  }

  next.position.x += next.velocity.x * dtSeconds;
  next.position.y += next.velocity.y * dtSeconds;
  return constrainToBounds(next, stage);
}

function applyRoamState(goose: Goose, dtSeconds: number, stage: StageBounds): Goose {
  const next = { ...goose, position: { ...goose.position }, velocity: { ...goose.velocity } };
  if (!canFly(next) && next.state === "fly") next.state = "waddle";

  const flyMode = next.state === "fly" && canFly(next);
  const roamSpeed = (flyMode ? 90 : 48) * SPEED_MULTIPLIER * next.speedModifier;
  const speed = Math.hypot(next.velocity.x, next.velocity.y);

  if (speed < 5) {
    const angle = randomBetween(0, Math.PI * 2);
    next.velocity.x = Math.cos(angle) * roamSpeed;
    next.velocity.y = Math.sin(angle) * roamSpeed * (flyMode ? 0.7 : 0.25);
  } else {
    next.velocity.x += (Math.random() - 0.5) * dtSeconds * roamSpeed * 0.9;
    next.velocity.y += (Math.random() - 0.5) * dtSeconds * roamSpeed * (flyMode ? 0.5 : 0.18);
  }

  const postSpeed = Math.hypot(next.velocity.x, next.velocity.y);
  if (postSpeed > roamSpeed) {
    next.velocity.x = (next.velocity.x / postSpeed) * roamSpeed;
    next.velocity.y = (next.velocity.y / postSpeed) * roamSpeed;
  }

  next.position.x += next.velocity.x * dtSeconds;
  next.position.y += next.velocity.y * dtSeconds;
  return constrainToBounds(next, stage);
}

function applyMovement(goose: Goose, dtSeconds: number, stage: StageBounds, geese: Goose[]): Goose {
  if (!goose.alive) return goose;
  if (goose.state === "sleep" || goose.state === "mourn" || goose.state === "interact" || goose.state === "eat") {
    return applyPerchState(goose, dtSeconds, stage);
  }
  if (goose.state === "follow") return applyFollowState(goose, geese, dtSeconds, stage);
  if (goose.state === "play") return applyPlayState(goose, geese, dtSeconds, stage);
  return applyRoamState(goose, dtSeconds, stage);
}

function maybeDie(goose: Goose, now: number, dtSeconds: number): Goose {
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
  const sleepDeathChanceThisTick = (SLEEP_DEATH_CHANCE_PER_HOUR / 3600) * dtSeconds;
  const randomSleepDeath = goose.state === "sleep" && Math.random() < sleepDeathChanceThisTick;
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
    perchTarget: { x: goose.position.x, y: goose.position.y, kind: "floor" },
  };
}

function updateReproduction(state: GooseLifeState, now: number, stage: StageBounds): GooseLifeState {
  const geese = state.geese.map((goose) => ({ ...goose, relationships: { ...goose.relationships }, eggs: [...(goose.eggs ?? [])] }));
  let lastReproductionAt = state.lastReproductionAt;

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
      if (mate && now - lastReproductionAt > REPRODUCTION_COOLDOWN_MS && Math.random() < REPRODUCTION_TICK_CHANCE) {
        female.pregnant = true;
        female.pregnancyUntil = now + HOUR_MS;
        female.mood = "happy";
        female.state = "interact";
        female.perchTarget = choosePerch(stage, female);
        lastReproductionAt = now;
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
      female.state = "waddle";
      female.perchTarget = { x: female.position.x, y: floorY(stage), kind: "floor" };
    }

    const hatchable = (female.eggs ?? []).filter((egg) => now - egg.laidAt >= egg.hatchAfterHours * HOUR_MS);
    if (hatchable.length > 0) {
      const father = geese.find((g) => g.id === female.targetId && g.sex === "male" && g.alive);
      female.eggs = (female.eggs ?? []).filter((egg) => now - egg.laidAt < egg.hatchAfterHours * HOUR_MS);
      for (let idx = 0; idx < hatchable.length; idx++) {
        geese.push(
          createGoose(now, stage, {
            name: randomName(new Set(geese.map((g) => g.name))),
            sex: Math.random() < 0.5 ? "male" : "female",
            ageHours: 0,
            birthTimestamp: now,
            mood: "playful",
            state: "follow",
            speedModifier: randomBetween(0.9, 1.3),
            paletteShift: Math.floor(randomBetween(-40, 40)),
            parentIds: father ? [female.id, father.id] : [female.id],
            isGosling: true,
            followIndex: idx,
            position: {
              x: female.position.x - (idx + 1) * FOLLOW_SPACING,
              y: floorY(stage),
            },
          }),
        );
      }
    }
  }

  return { ...state, geese, lastReproductionAt };
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
      perchTarget: { x: deadWithFuneral.position.x, y: deadWithFuneral.position.y, kind: "floor" as const },
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
    perches: stage.perches ?? [{ x: (stage.width || DEFAULT_STAGE.width) / 2, y: (stage.height || DEFAULT_STAGE.height) * LOWER_BAND_RATIO, kind: "floor" }],
  };

  let geese = state.geese.map((original) => {
    let goose = { ...original, relationships: { ...original.relationships }, eggs: [...(original.eggs ?? [])] };
    goose.ageHours = ageFromBirth(goose.birthTimestamp, now);
    goose = maybeDie(goose, now, dtSeconds);

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
      if (!canFly(goose) && goose.state === "fly") goose.state = "waddle";
      if (goose.state === "sleep" || goose.state === "interact" || goose.state === "eat" || goose.state === "mourn") {
        goose.perchTarget = choosePerch(safeStage, goose);
      } else if (goose.state === "waddle" || goose.state === "idle" || goose.state === "follow") {
        goose.perchTarget = { x: goose.position.x, y: floorY(safeStage), kind: "floor" };
      } else {
        goose.perchTarget = undefined;
      }
      goose.nextBehaviorAt = nextBehaviorAt(now);

      const angle = randomBetween(0, Math.PI * 2);
      const speed = (goose.state === "fly" ? 90 : goose.state === "sleep" ? 8 : goose.state === "play" ? 92 : 44) * SPEED_MULTIPLIER * goose.speedModifier;
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
