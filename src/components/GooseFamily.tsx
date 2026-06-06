// Eggs + goslings + grown-up family adults overlay. Lives alongside the
// two FlyingGoose instances.
//
// Lifecycle:
//   • Snack ends → mother (white) lays 1–3 eggs at the floor near her.
//   • Eggs hatch 18–32 s later into goslings (random gosling-white/brown).
//   • Goslings waddle, may roam up to 20 % of screen height above the
//     floor, follow the mother when she's grounded.
//   • After ~3 min, goslings grow up into adult family members with a
//     random color from the pink/yellow/lightgreen/amigablue/brown/
//     white/black palette.
//   • Total adults (incl. the 2 originals) cap at 8. When full, the
//     2 oldest family adults are marked to pass after 5 minutes; a
//     mourning ritual fires for 45 s with darkened scrollers and a
//     special chatter pool.

import { useEffect, useRef, useState } from "react";
import {
  emitFamilyEvent,
  getGoosePositions,
  subscribeFamilyEvents,
} from "@/lib/gooseSocial";
import {
  BASE_SPRITE_H,
  BASE_SPRITE_W,
  buildGooseFrameDataUrls,
  NECK_PIVOT_X_PX,
  NECK_PIVOT_Y_PX,
  STAND_BODY,
  STAND_HEAD,
} from "@/lib/gooseSprite";
import { getSceneScale } from "@/lib/gooseScene";
import {
  hatchDueEggs,
  makeEgg,
  type Egg,
} from "@/lib/gooseLife/eggHatch";
import {
  COLOR_FILTER,
  formatAge,
  getRoster,
  isPlaceholderName,
  pickRandomAdultColor,
  pickRandomSex,
  pickUniqueName,
  setRoster,
  type GooseColor,
  type GooseSex,
  type RosterEntry,
} from "@/lib/gooseFamilyRoster";
import { setMourningActive } from "@/lib/cracktroUi";

const STORAGE_EGGS = "cracktro-goose-eggs-v2";
const STORAGE_GOSLINGS = "cracktro-goose-goslings-v1";
const MAX_LIVE_EGGS = 4;
const MAX_GOSLINGS = 8;
const MAX_TOTAL_ADULTS = 8; // includes the 2 originals
const GOSLING_SCALE_FACTOR = 0.58;
const GROW_UP_MS = 8 * 60_000; // 8 min wall-clock to grow into an adult
const ADULT_LIFE_BEFORE_DEATH_MS = 5 * 60_000;
const MOURNING_DURATION_MS = 45_000;

// Ground waddle constants.
const WADDLE_CHAR_CYCLE_FREQ = 0.55;
const WADDLE_CHAR_BODY_SWAY = 5.4;
const WADDLE_CHAR_BODY_BOB = 4.2;
const WADDLE_CHAR_BODY_TILT = 9.6;
const WADDLE_CHAR_HEAD_SWAY = 6.6;
const WADDLE_CHAR_HEAD_DIP = 5.2;
const WADDLE_CHAR_HEAD_TILT = 27;

const PECK_CYCLE_MS = 520;
const PECK_HEAD_DROP = 5.5;
const PECK_HEAD_ROTATE = 22;

const MOURNING_LINES = [
  "We honor you, friend.",
  "Fly on, dear one.",
  "The flock remembers.",
  "Silent wings.",
  "Goodbye, gentle goose.",
  "Beyond the scroller, we meet again.",
  "Honk softly... they are at rest.",
  "Feathers to feathers.",
];

type Gosling = {
  id: string;
  rosterId: string;
  name: string;
  sex: GooseSex;
  variant: "gosling-white" | "gosling-brown";
  x: number;
  y: number;
  dir: 1 | -1;
  phase: number;
  targetX: number;
  targetY: number;
  bornAt: number;
  bubbleUntil: number;
  bubbleText: string;
};

type AdultActivity = "waddle" | "sit" | "socialise" | "play" | "fly";

type FamilyAdult = {
  id: string;
  rosterId: string;
  color: GooseColor;
  x: number;
  y: number;
  dir: 1 | -1;
  phase: number;
  targetX: number;
  targetY: number;
  bornAt: number;
  bubbleUntil: number;
  bubbleText: string;
  diesAt?: number;
  isDying?: boolean;
  activity: AdultActivity;
  activityUntil: number;
  playHopPhase: number;
  descending?: boolean;
};

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function loadEggs(): Egg[] {
  try {
    const raw = localStorage.getItem(STORAGE_EGGS);
    if (!raw) return [];
    const data = JSON.parse(raw) as Egg[];
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e) => e && typeof e.hatchAt === "number" && e.hatchAt > Date.now() - 5 * 60_000,
    );
  } catch { return []; }
}
function saveEggs(eggs: Egg[]) {
  try { localStorage.setItem(STORAGE_EGGS, JSON.stringify(eggs)); } catch { /* ignore */ }
}
function loadGoslings(): Gosling[] {
  try {
    const raw = localStorage.getItem(STORAGE_GOSLINGS);
    if (!raw) return [];
    const data = JSON.parse(raw) as Partial<Gosling>[];
    if (!Array.isArray(data)) return [];
    // Backfill rosterId/name/sex for older saves so promote-to-adult still works.
    // If the stored name is a legacy placeholder ("Gosling"/empty), assign a
    // unique name from the pool and sync the matching roster entry.
    const roster = getRoster();
    const taken = new Set(roster.map((e) => e.name));
    const rosterUpdates = new Map<string, string>(); // rosterId -> new name
    const result = data.map((g): Gosling => {
      const rosterId = g.rosterId ?? `gosling-legacy-${Math.random().toString(36).slice(2, 8)}`;
      let name = g.name;
      if (isPlaceholderName(name)) {
        name = pickUniqueName(taken);
        taken.add(name);
        rosterUpdates.set(rosterId, name);
      }
      return {
        id: g.id ?? `g-legacy-${Math.random().toString(36).slice(2, 6)}`,
        rosterId,
        name: name!,
        sex: g.sex ?? (Math.random() < 0.5 ? "f" : "m"),
        variant: g.variant ?? "gosling-white",
        x: g.x ?? 0,
        y: g.y ?? 0,
        dir: (g.dir ?? 1) as 1 | -1,
        phase: g.phase ?? 0,
        targetX: g.targetX ?? (g.x ?? 0),
        targetY: g.targetY ?? (g.y ?? 0),
        bornAt: g.bornAt ?? Date.now(),
        bubbleUntil: 0,
        bubbleText: "",
      };
    });
    if (rosterUpdates.size > 0) {
      const next = roster.map((e) =>
        rosterUpdates.has(e.id) ? { ...e, name: rosterUpdates.get(e.id)! } : e,
      );
      setRoster(next);
    }
    return result;
  } catch { return []; }
}
function saveGoslings(g: Gosling[]) {
  try {
    localStorage.setItem(STORAGE_GOSLINGS, JSON.stringify(
      g.map(({ id, rosterId, name, sex, variant, x, y, dir, phase, targetX, targetY, bornAt }) =>
        ({ id, rosterId, name, sex, variant, x, y, dir, phase, targetX, targetY, bornAt, bubbleUntil: 0, bubbleText: "" })),
    ));
  } catch { /* ignore */ }
}

// Ensure originals (white + brown) exist in the roster.
function ensureOriginals() {
  const roster = getRoster();
  if (roster.some((e) => e.kind === "original")) return;
  const taken = new Set(roster.map((e) => e.name));
  const motherName = pickUniqueName(taken); taken.add(motherName);
  const fatherName = pickUniqueName(taken);
  const now = Date.now();
  setRoster([
    ...roster,
    { id: "original-white", name: motherName, sex: "f", color: "white", bornAt: now, kind: "original" },
    { id: "original-brown", name: fatherName, sex: "m", color: "brown", bornAt: now, kind: "original" },
  ]);
}

const GooseFamily = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const eggsRef = useRef<Egg[]>(loadEggs());
  const goslingsRef = useRef<Gosling[]>(loadGoslings());
  const adultsRef = useRef<FamilyAdult[]>([]);
  const adultsSittingRef = useRef(false);
  const mourningUntilRef = useRef<number>(0);
  const lastMourningChatterAtRef = useRef<number>(0);
  const [, setTick] = useState(0);

  const goslingFramesWhite = useRef<string[] | null>(null);
  const goslingFramesBrown = useRef<string[] | null>(null);
  const adultFramesWhite = useRef<string[] | null>(null);
  if (!goslingFramesWhite.current) goslingFramesWhite.current = buildGooseFrameDataUrls("gosling-white");
  if (!goslingFramesBrown.current) goslingFramesBrown.current = buildGooseFrameDataUrls("gosling-brown");
  if (!adultFramesWhite.current) adultFramesWhite.current = buildGooseFrameDataUrls("white");

  // Hydrate adults from roster on mount. Also rescue stuck legacy goslings:
  // any roster entry kind=="gosling" past GROW_UP_MS with no live gosling in
  // goslingsRef gets promoted to kind=="adult" right now. Placeholder adult
  // names ("Gosling") get a fresh unique name.
  useEffect(() => {
    ensureOriginals();
    let roster = getRoster();
    const wallNow = Date.now();
    const liveGoslingIds = new Set(goslingsRef.current.map((g) => g.rosterId));
    const taken = new Set(roster.map((e) => e.name));
    let rosterChanged = false;
    roster = roster.map((e) => {
      // Stuck gosling with no live render → promote to adult.
      if (
        e.kind === "gosling" &&
        !liveGoslingIds.has(e.id) &&
        wallNow - e.bornAt > GROW_UP_MS
      ) {
        rosterChanged = true;
        let name = e.name;
        if (isPlaceholderName(name)) {
          name = pickUniqueName(taken);
        }
        taken.delete(e.name); taken.add(name);
        return { ...e, name, kind: "adult", color: pickRandomAdultColor() };
      }
      // Adult still wearing the placeholder "Gosling" name → rename.
      if (e.kind === "adult" && isPlaceholderName(e.name)) {
        rosterChanged = true;
        const name = pickUniqueName(taken);
        taken.delete(e.name); taken.add(name);
        return { ...e, name };
      }
      return e;
    });
    if (rosterChanged) setRoster(roster);

    const w = rootRef.current?.clientWidth ?? window.innerWidth;
    const h = rootRef.current?.clientHeight ?? window.innerHeight;
    const sceneScale = getSceneScale(w, h);
    const adultFloorY = h - BASE_SPRITE_H * sceneScale * 0.6 - 12;
    const ceilingY = h * 0.8;
    adultsRef.current = roster
      .filter((e) => e.kind === "adult")
      .map((e): FamilyAdult => ({
        id: `adult-${e.id}`,
        rosterId: e.id,
        color: e.color,
        x: rand(80, Math.max(160, w - 80)),
        y: rand(ceilingY, adultFloorY),
        dir: Math.random() < 0.5 ? -1 : 1,
        phase: Math.random() * Math.PI * 2,
        targetX: rand(80, Math.max(160, w - 80)),
        targetY: adultFloorY,
        bornAt: e.bornAt,
        bubbleUntil: 0,
        bubbleText: "",
        activity: "waddle",
        activityUntil: Date.now() + 4000 + Math.random() * 8000,
        playHopPhase: 0,
      }));
    setTick((t) => t + 1);
  }, []);

  // Family events: snack toggles gosling sit/peck flag; incubation-start
  // is when the mother has descended and dropped 1–3 eggs on the floor.
  useEffect(() => {
    const unsub = subscribeFamilyEvents((event) => {
      if (event.type === "snack-start") {
        adultsSittingRef.current = true;
        setTick((t) => t + 1);
        return;
      }
      if (event.type === "snack-end") {
        adultsSittingRef.current = false;
        setTick((t) => t + 1);
        return;
      }
      if (event.type === "incubation-start") {
        const w = rootRef.current?.clientWidth ?? window.innerWidth;
        const h = rootRef.current?.clientHeight ?? window.innerHeight;
        const anchorX = event.x ?? w / 2;
        const floorY = h - 28;
        const liveEggs = eggsRef.current.length;
        const room = Math.max(0, MAX_LIVE_EGGS - liveEggs);
        if (room > 0) {
          const count = Math.min(room, 1 + Math.floor(Math.random() * 3));
          const now = Date.now();
          const fresh: Egg[] = [];
          for (let i = 0; i < count; i++) {
            fresh.push(
              makeEgg({
                id: `egg-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                x: Math.max(40, Math.min(w - 40, anchorX + rand(-50, 50))),
                y: floorY,
                laidAt: now,
              }),
            );
          }
          eggsRef.current = [...eggsRef.current, ...fresh];
          saveEggs(eggsRef.current);
        }
        setTick((t) => t + 1);
      }
    });
    return () => { unsub(); };
  }, []);


  // Main animation loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const wallNow = Date.now();

      const root = rootRef.current;
      const w = root?.clientWidth ?? window.innerWidth;
      const h = root?.clientHeight ?? window.innerHeight;
      const sceneScale = getSceneScale(w, h);
      const goslingFloorY = h - BASE_SPRITE_H * sceneScale * GOSLING_SCALE_FACTOR * 0.6 - 12;
      const adultFloorY = h - BASE_SPRITE_H * sceneScale * 0.6 - 12;
      const ceilingY = h * 0.8; // goslings may roam UP TO 20% of screen height above floor

      // === Eggs → goslings ===
      const slotsLeft = Math.max(0, MAX_GOSLINGS - goslingsRef.current.length);
      const { stillEggs, hatched } = hatchDueEggs(eggsRef.current, wallNow, slotsLeft);
      if (hatched.length > 0) {
        const rosterNow = getRoster();
        const taken = new Set(rosterNow.map((e) => e.name));
        const newGoslingRoster: RosterEntry[] = [];
        for (const egg of hatched) {
          const variant: "gosling-white" | "gosling-brown" =
            Math.random() < 0.5 ? "gosling-white" : "gosling-brown";
          const name = pickUniqueName(taken); taken.add(name);
          const sex = pickRandomSex();
          const rosterId = `gosling-${wallNow}-${Math.random().toString(36).slice(2, 6)}`;
          const color: GooseColor = variant === "gosling-white" ? "white" : "brown";
          newGoslingRoster.push({
            id: rosterId, name, sex, color, bornAt: wallNow, kind: "gosling",
          });
          goslingsRef.current.push({
            id: `g-${wallNow}-${Math.random().toString(36).slice(2, 6)}`,
            rosterId,
            name,
            sex,
            variant,
            x: egg.x,
            y: goslingFloorY,
            dir: Math.random() < 0.5 ? -1 : 1,
            phase: Math.random() * Math.PI * 2,
            targetX: Math.max(40, Math.min(w - 40, egg.x + rand(-40, 40))),
            targetY: goslingFloorY,
            bornAt: wallNow,
            bubbleUntil: wallNow + 2200,
            bubbleText: `Peep! I'm ${name} 🐣`,
          });
        }
        if (newGoslingRoster.length > 0) {
          setRoster([...rosterNow, ...newGoslingRoster]);
        }
        eggsRef.current = stillEggs;
        saveEggs(stillEggs);
        saveGoslings(goslingsRef.current);
        if (stillEggs.length === 0) {
          emitFamilyEvent({ type: "all-eggs-hatched" });
        }
      }


      // === Goslings: grow up after GROW_UP_MS, otherwise waddle ===
      const positions = getGoosePositions();
      const parentAnchor = positions?.white ?? positions?.brown ?? null;
      const sitting = adultsSittingRef.current;
      const adultCount = adultsRef.current.length + 2; // +2 originals
      const grownOut: Gosling[] = [];
      const remaining: Gosling[] = [];
      for (const g of goslingsRef.current) {
        if (wallNow - g.bornAt > GROW_UP_MS && adultCount + grownOut.length < MAX_TOTAL_ADULTS) {
          grownOut.push(g);
          continue;
        }
        if (sitting) {
          g.phase += dt;
          remaining.push(g);
          continue;
        }
        // Roam: re-target every time we arrive (clamped + opposite-side push to avoid corner-stick).
        const dxToTarget = g.targetX - g.x;
        const dyToTarget = g.targetY - g.y;
        if (Math.abs(dxToTarget) < 14 && Math.abs(dyToTarget) < 14) {
          const base = parentAnchor?.x ?? w / 2;
          // If we're crammed against a wall, pick a target on the opposite side.
          let nextTargetX: number;
          if (g.x > w - 60) nextTargetX = rand(40, w * 0.4);
          else if (g.x < 60) nextTargetX = rand(w * 0.6, w - 40);
          else nextTargetX = Math.max(40, Math.min(w - 40, base + rand(-110, 110)));
          g.targetX = nextTargetX;
          // 30 % of the time, fly a little — up to 20 % above the floor.
          g.targetY = Math.random() < 0.3
            ? rand(ceilingY, goslingFloorY)
            : goslingFloorY;
        }
        const speedX = 36 * sceneScale;
        const speedY = 28 * sceneScale;
        const stepX = Math.sign(g.targetX - g.x) * Math.min(Math.abs(g.targetX - g.x), speedX * dt);
        const stepY = Math.sign(g.targetY - g.y) * Math.min(Math.abs(g.targetY - g.y), speedY * dt);
        g.x = Math.max(20, Math.min(w - 20, g.x + stepX));
        g.y = Math.max(ceilingY - 20, Math.min(goslingFloorY, g.y + stepY));
        g.dir = stepX >= 0 ? 1 : -1;
        g.phase += dt;
        remaining.push(g);
      }
      if (grownOut.length > 0) {
        // Promote goslings to family adults — preserve their roster identity
        // (name, sex, original bornAt), just swap kind + pick adult color.
        const rosterBefore = getRoster();
        const promotedIds = new Set(grownOut.map((g) => g.rosterId));
        const kept = rosterBefore.filter((e) => !promotedIds.has(e.id));
        const promotionTaken = new Set(kept.map((e) => e.name));
        const promoted: RosterEntry[] = grownOut.map((g) => {
          const existing = rosterBefore.find((e) => e.id === g.rosterId);
          const color = pickRandomAdultColor();
          let name = existing?.name ?? g.name;
          if (isPlaceholderName(name)) {
            name = pickUniqueName(promotionTaken);
          }
          promotionTaken.add(name);
          return {
            id: g.rosterId,
            name,
            sex: existing?.sex ?? g.sex,
            color,
            bornAt: existing?.bornAt ?? g.bornAt,
            kind: "adult",
          };
        });
        for (let i = 0; i < grownOut.length; i++) {
          const g = grownOut[i];
          const entry = promoted[i];
          adultsRef.current.push({
            id: `a-${entry.id}`,
            rosterId: entry.id,
            color: entry.color,
            x: g.x,
            y: adultFloorY,
            dir: g.dir,
            phase: Math.random() * Math.PI * 2,
            targetX: Math.max(80, Math.min(w - 80, g.x + rand(-100, 100))),
            targetY: adultFloorY,
            bornAt: entry.bornAt,
            bubbleUntil: wallNow + 2400,
            bubbleText: `I'm ${entry.name}! 🎉`,
            activity: "waddle",
            activityUntil: wallNow + 4000 + Math.random() * 8000,
            playHopPhase: 0,
          });
        }
        setRoster([...kept, ...promoted]);
        emitFamilyEvent({ type: "goslings-grown" });
        goslingsRef.current = remaining;
        saveGoslings(remaining);
      } else {
        goslingsRef.current = remaining;
      }

      // === Cap check: if adults exceed cap, mark oldest two to die in 5 min ===
      if (adultsRef.current.length + 2 > MAX_TOTAL_ADULTS) {
        const unmarked = adultsRef.current.filter((a) => !a.diesAt);
        unmarked.sort((a, b) => a.bornAt - b.bornAt);
        for (let i = 0; i < Math.min(2, unmarked.length); i++) {
          unmarked[i].diesAt = wallNow + ADULT_LIFE_BEFORE_DEATH_MS;
        }
      }

      // === Mourning ritual: trigger when any marked adult's diesAt is reached ===
      const dyingNow = adultsRef.current.filter((a) => a.diesAt && wallNow >= a.diesAt && !a.isDying);
      if (dyingNow.length > 0 && mourningUntilRef.current < wallNow) {
        for (const a of dyingNow) a.isDying = true;
        mourningUntilRef.current = wallNow + MOURNING_DURATION_MS;
        setMourningActive(true);
      }
      if (mourningUntilRef.current > 0 && wallNow >= mourningUntilRef.current) {
        // Ritual ends — remove the dying adults from roster + render.
        const dyingIds = new Set(adultsRef.current.filter((a) => a.isDying).map((a) => a.rosterId));
        adultsRef.current = adultsRef.current.filter((a) => !dyingIds.has(a.rosterId));
        if (dyingIds.size > 0) {
          setRoster(getRoster().filter((e) => !dyingIds.has(e.id)));
        }
        mourningUntilRef.current = 0;
        setMourningActive(false);
      }

      // === Adults: waddle / mourn ===
      const mourningActive = mourningUntilRef.current > 0;
      for (const a of adultsRef.current) {
        if (mourningActive) {
          // Slow walk toward the centroid of dying adults.
          const dying = adultsRef.current.filter((x) => x.isDying);
          const cx = dying.length > 0
            ? dying.reduce((s, x) => s + x.x, 0) / dying.length
            : w / 2;
          const dx = cx + (a.id.charCodeAt(2) % 80 - 40) - a.x;
          a.x += Math.sign(dx) * Math.min(Math.abs(dx), 14 * sceneScale * dt);
          a.dir = dx >= 0 ? 1 : -1;
          a.phase += dt * 0.4;
        } else {
          // Rotate through varied activities: waddle, rest/sit, socialise,
          // play. Each one lasts ~6–15s, then a new activity is rolled.
          if (wallNow >= a.activityUntil && !a.descending) {
            // If currently flying and the window ends, enter descending
            // phase instead of teleport-dropping to the floor.
            if (a.activity === "fly" && Math.abs(a.y - adultFloorY) > 4) {
              a.descending = true;
              a.targetY = adultFloorY;
              // keep going toward a sensible landing x near current position
              a.targetX = Math.max(80, Math.min(w - 80, a.x + rand(-120, 120)));
            } else {
              const r = Math.random();
              a.activity = r < 0.32 ? "waddle"
                : r < 0.52 ? "sit"
                : r < 0.72 ? "socialise"
                : r < 0.88 ? "play"
                : "fly";
              a.activityUntil = wallNow + 6000 + Math.random() * 9000;
              if (a.activity === "waddle" || a.activity === "socialise") {
                a.targetX = Math.max(80, Math.min(w - 80, a.x + rand(-200, 200)));
                a.targetY = adultFloorY;
              }
              if (a.activity === "socialise") {
                const others = adultsRef.current.filter((x) => x.id !== a.id);
                if (others.length > 0) {
                  const peer = others[Math.floor(Math.random() * others.length)];
                  a.targetX = Math.max(80, Math.min(w - 80, peer.x + rand(-30, 30)));
                  a.targetY = adultFloorY;
                }
              }
              if (a.activity === "sit") {
                a.targetY = adultFloorY;
              }
              if (a.activity === "play") {
                a.playHopPhase = 0;
                a.targetY = adultFloorY;
              }
              if (a.activity === "fly") {
                // Take off — ensure target X is meaningfully far away so
                // the goose actually traverses instead of flipping in place.
                const minTravel = 160;
                const sign = Math.random() < 0.5 ? -1 : 1;
                const span = minTravel + Math.random() * 220;
                let tx = a.x + sign * span;
                if (tx < 80 || tx > w - 80) tx = a.x - sign * span;
                a.targetX = Math.max(60, Math.min(w - 60, tx));
                a.targetY = rand(h * 0.2, h * 0.5);
                a.activityUntil = wallNow + 9000 + Math.random() * 4000;
                a.dir = a.targetX > a.x ? 1 : -1;
                a.descending = false;
              }
            }
          }
          if (a.activity === "sit") {
            a.phase += dt * 0.6;
          } else if (a.activity === "play") {
            a.playHopPhase += dt;
            a.phase += dt * 1.4;
            if (Math.random() < 0.01) a.dir = (Math.random() < 0.5 ? -1 : 1) as 1 | -1;
          } else if (a.activity === "fly") {
            // Fly toward target. Only flip facing direction when the
            // horizontal delta is meaningful, to avoid mid-air flicker.
            const dxToTarget = a.targetX - a.x;
            if (Math.abs(dxToTarget) > 30) {
              a.dir = dxToTarget > 0 ? 1 : -1;
            }
            const speed = 60;
            const stepX = a.dir * speed * sceneScale * dt;
            const dyTotal = a.targetY - a.y;
            const stepY = Math.sign(dyTotal) * Math.min(Math.abs(dyTotal), speed * sceneScale * dt);
            a.x = Math.max(20, Math.min(w - 20, a.x + stepX));
            a.y = Math.max(20, Math.min(adultFloorY, a.y + stepY));
            a.phase += dt * 1.6;
            // Reached fly target before window ends — pick a new airborne target
            // in the upper band so the goose keeps cruising instead of stalling.
            if (!a.descending && Math.abs(dxToTarget) < 24 && Math.abs(dyTotal) < 24) {
              const sign = Math.random() < 0.5 ? -1 : 1;
              const span = 160 + Math.random() * 220;
              let tx = a.x + sign * span;
              if (tx < 80 || tx > w - 80) tx = a.x - sign * span;
              a.targetX = Math.max(60, Math.min(w - 60, tx));
              a.targetY = rand(h * 0.2, h * 0.5);
            }
            // Landed from descent — clear fly state so next tick rolls a ground activity.
            if (a.descending && Math.abs(a.y - adultFloorY) < 2) {
              a.descending = false;
              a.activity = "waddle";
              a.activityUntil = wallNow; // trigger fresh roll next frame
              a.y = adultFloorY;
            }
          } else {
            // waddle + socialise: walk along the floor band only.
            if (Math.abs(a.targetX - a.x) < 18) {
              a.targetX = Math.max(80, Math.min(w - 80, a.x + rand(-180, 180)));
              a.targetY = adultFloorY;
            }
            a.dir = a.targetX > a.x ? 1 : -1;
            const speed = a.activity === "socialise" ? 34 : 28;
            const stepX = a.dir * speed * sceneScale * dt;
            const dyTotal = a.targetY - a.y;
            const stepY = Math.sign(dyTotal) * Math.min(Math.abs(dyTotal), speed * 0.7 * sceneScale * dt);
            a.x = Math.max(20, Math.min(w - 20, a.x + stepX));
            a.y = Math.max(adultFloorY - 4, Math.min(adultFloorY, a.y + stepY));
            a.phase += dt;
          }
        }
        // Apply playful hop offset on y (only for sit/play which anchor to floor).
        if (a.activity === "sit" || a.activity === "play" || mourningActive) {
          const hopY = a.activity === "play" && !mourningActive
            ? -Math.abs(Math.sin(a.playHopPhase * 6)) * 10 * sceneScale
            : 0;
          a.y = adultFloorY + hopY;
        }
      }

      // Mourning chatter pulse — pick a random adult and a random line every ~3s.
      if (mourningActive && wallNow - lastMourningChatterAtRef.current > 3000 && adultsRef.current.length > 0) {
        const speaker = adultsRef.current[Math.floor(Math.random() * adultsRef.current.length)];
        speaker.bubbleText = MOURNING_LINES[Math.floor(Math.random() * MOURNING_LINES.length)];
        speaker.bubbleUntil = wallNow + 2600;
        lastMourningChatterAtRef.current = wallNow;
      }

      setTick((t) => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // === RENDER ===
  const root = rootRef.current;
  const w = root?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
  const h = root?.clientHeight ?? (typeof window !== "undefined" ? window.innerHeight : 768);
  const sceneScale = getSceneScale(w, h);
  const goslingW = BASE_SPRITE_W * sceneScale * GOSLING_SCALE_FACTOR;
  const goslingH = BASE_SPRITE_H * sceneScale * GOSLING_SCALE_FACTOR;
  const adultW = BASE_SPRITE_W * sceneScale;
  const adultH = BASE_SPRITE_H * sceneScale;
  const now = Date.now();

  // Renders a clamped bubble (kept within [4, w-4] horizontally; flips below
  // the sprite when the sprite is too near the top edge).
  const renderBubble = (text: string, spriteCx: number, spriteCy: number, spriteH: number, dir: 1 | -1) => {
    const padding = 8;
    const maxBubbleW = Math.max(60, w - padding * 2);
    const ESTIMATED_WIDTH = Math.min(maxBubbleW, Math.max(60, text.length * 7 + 24));
    const BUBBLE_H = 24;
    let left = spriteCx;
    if (left - ESTIMATED_WIDTH / 2 < padding) left = ESTIMATED_WIDTH / 2 + padding;
    if (left + ESTIMATED_WIDTH / 2 > w - padding) left = w - ESTIMATED_WIDTH / 2 - padding;
    let top = spriteCy - spriteH / 2 - BUBBLE_H - 6;
    let flipped = false;
    if (top < padding) {
      top = spriteCy + spriteH / 2 + 6;
      flipped = true;
    }
    return (
      <div
        style={{
          position: "absolute",
          left: left - ESTIMATED_WIDTH / 2,
          top,
          width: ESTIMATED_WIDTH,
          minHeight: BUBBLE_H,
          padding: "2px 8px",
          background: "#fff",
          color: "#1a1a1a",
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
          textAlign: "center",
          border: "2px solid #1a1a1a",
          borderRadius: 6,
          boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
          whiteSpace: "normal",
          wordBreak: "break-word",
          overflow: "hidden",
        }}
      >
        {text}
        {/* dir/flipped used only to avoid lint warnings */}
        <span style={{ display: "none" }}>{dir}{flipped ? "f" : "n"}</span>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 59 }}
      aria-hidden
    >
      {/* Eggs */}
      {eggsRef.current.map((egg) => {
        const wobble = Math.sin((now - egg.laidAt) / 320) * 2;
        const sizeW = 14 * sceneScale;
        const sizeH = 18 * sceneScale;
        return (
          <div
            key={egg.id}
            style={{
              position: "absolute",
              left: egg.x - sizeW / 2,
              top: egg.y - sizeH / 2,
              width: sizeW,
              height: sizeH,
              transform: `rotate(${wobble}deg)`,
              background: "radial-gradient(ellipse at 35% 30%, #fff8e7 0%, #f0d9a4 70%, #c8a766 100%)",
              border: "1.5px solid #4a3520",
              borderRadius: "50% 50% 48% 48% / 60% 60% 40% 40%",
              boxShadow: "0 2px 0 rgba(0,0,0,0.35)",
            }}
          />
        );
      })}

      {/* Goslings */}
      {goslingsRef.current.map((g) => {
        const frames = g.variant === "gosling-white"
          ? goslingFramesWhite.current!
          : goslingFramesBrown.current!;
        const phase = g.phase;
        const sitting = adultsSittingRef.current;
        let bodyTX = 0, bodyTY = 0, bodyTilt = 0;
        let headTX = 0, headTY = 0, headTilt = 0;
        if (sitting) {
          const peck = Math.sin(phase * (1000 / PECK_CYCLE_MS) * Math.PI * 2);
          const peckDown = Math.max(0, peck);
          headTY = peckDown * PECK_HEAD_DROP * sceneScale * GOSLING_SCALE_FACTOR;
          headTilt = peckDown * PECK_HEAD_ROTATE;
        } else {
          const stepCycle = Math.sin(phase * WADDLE_CHAR_CYCLE_FREQ * Math.PI * 2);
          const stepLanding = Math.abs(stepCycle);
          bodyTX = stepCycle * WADDLE_CHAR_BODY_SWAY * sceneScale * GOSLING_SCALE_FACTOR;
          bodyTY = stepLanding * WADDLE_CHAR_BODY_BOB * sceneScale * GOSLING_SCALE_FACTOR;
          bodyTilt = stepCycle * WADDLE_CHAR_BODY_TILT;
          // Head stays welded to the neck socket: no independent translate;
          // only a gentle tilt rotating around the neck pivot.
          headTX = 0;
          headTY = 0;
          headTilt = Math.sin(phase * WADDLE_CHAR_CYCLE_FREQ * Math.PI * 2 * 1.1) * WADDLE_CHAR_HEAD_TILT * 0.5;
        }
        const tx = g.x - goslingW / 2;
        const ty = g.y - goslingH / 2;
        const bubble = g.bubbleUntil > now;
        return (
          <div
            key={g.id}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: goslingW,
              height: goslingH,
              transform: `translate3d(${tx}px, ${ty}px, 0) scaleX(${g.dir})`,
              transformOrigin: "center center",
              filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.28))",
            }}
          >
            <div style={{ position: "absolute", inset: 0, width: goslingW, height: goslingH,
              transform: `translate(${bodyTX}px, ${bodyTY}px) rotate(${bodyTilt}deg)`,
              transformOrigin: "center center" }}>
              <img src={frames[STAND_BODY]} alt="" width={goslingW} height={goslingH}
                style={{ position: "absolute", inset: 0, width: goslingW, height: goslingH,
                  imageRendering: "pixelated" }} />
              <img src={frames[STAND_HEAD]} alt="" width={goslingW} height={goslingH}
                style={{ position: "absolute", inset: 0, width: goslingW, height: goslingH,
                  imageRendering: "pixelated",
                  transformOrigin: `${NECK_PIVOT_X_PX * sceneScale * GOSLING_SCALE_FACTOR}px ${NECK_PIVOT_Y_PX * sceneScale * GOSLING_SCALE_FACTOR}px`,
                  transform: `translate(${headTX}px, ${headTY}px) rotate(${headTilt}deg)` }} />
            </div>

            {bubble && (
              <div style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `scaleX(${g.dir})`, // un-mirror bubble
              }}>
                {/* bubble is clamped via absolute parent — re-render bubble at root */}
              </div>
            )}
          </div>
        );
      })}

      {/* Gosling bubbles (rendered outside the mirror transform, clamped to stage) */}
      {goslingsRef.current.filter((g) => g.bubbleUntil > now && g.bubbleText).map((g) => (
        <div key={`gb-${g.id}`}>
          {renderBubble(g.bubbleText, g.x, g.y, goslingH, g.dir)}
        </div>
      ))}

      {/* Family adults (grown-up offspring) */}
      {adultsRef.current.map((a) => {
        const frames = adultFramesWhite.current!;
        const dying = a.isDying;
        const phase = a.phase;
        const stepCycle = Math.sin(phase * WADDLE_CHAR_CYCLE_FREQ * Math.PI * 2);
        const stepLanding = Math.abs(stepCycle);
        const bodyTX = stepCycle * WADDLE_CHAR_BODY_SWAY * sceneScale * (dying ? 0.4 : 1);
        const bodyTY = stepLanding * WADDLE_CHAR_BODY_BOB * sceneScale * (dying ? 0.4 : 1);
        const bodyTilt = stepCycle * WADDLE_CHAR_BODY_TILT * (dying ? 0.4 : 1);
        // Head stays welded to the neck socket: no independent translate;
        // only a gentle tilt rotating around the neck pivot.
        const headTX = 0;
        const headTY = dying ? 6 * sceneScale : 0;
        const headTilt = (Math.sin(phase * WADDLE_CHAR_CYCLE_FREQ * Math.PI * 2 * 1.1) * WADDLE_CHAR_HEAD_TILT * 0.5 * (dying ? 0.3 : 1)) - (dying ? 18 : 0);
        const tx = a.x - adultW / 2;
        const ty = a.y - adultH / 2;
        const bubble = a.bubbleUntil > now;
        const filter = `${COLOR_FILTER[a.color]} drop-shadow(0 2px 0 rgba(0,0,0,0.28))${dying ? " opacity(0.5) grayscale(0.6)" : ""}`;
        return (
          <div key={a.id}
            style={{
              position: "absolute",
              left: 0, top: 0, width: adultW, height: adultH,
              transform: `translate3d(${tx}px, ${ty}px, 0) scaleX(${a.dir})`,
              transformOrigin: "center center",
              filter,
              transition: "filter 800ms ease-out",
            }}
          >
            <div style={{ position: "absolute", inset: 0, width: adultW, height: adultH,
              transform: `translate(${bodyTX}px, ${bodyTY}px) rotate(${bodyTilt}deg)`,
              transformOrigin: "center center" }}>
              <img src={frames[STAND_BODY]} alt="" width={adultW} height={adultH}
                style={{ position: "absolute", inset: 0, width: adultW, height: adultH,
                  imageRendering: "pixelated" }} />
              <img src={frames[STAND_HEAD]} alt="" width={adultW} height={adultH}
                style={{ position: "absolute", inset: 0, width: adultW, height: adultH,
                  imageRendering: "pixelated",
                  transformOrigin: `${NECK_PIVOT_X_PX * sceneScale}px ${NECK_PIVOT_Y_PX * sceneScale}px`,
                  transform: `translate(${headTX}px, ${headTY}px) rotate(${headTilt}deg)` }} />
            </div>

            {bubble && (
              <div style={{ position: "absolute", left: 0, top: 0, transform: `scaleX(${a.dir})` }} />
            )}
          </div>
        );
      })}

      {/* Adult bubbles (clamped) */}
      {adultsRef.current.filter((a) => a.bubbleUntil > now && a.bubbleText).map((a) => (
        <div key={`ab-${a.id}`}>
          {renderBubble(a.bubbleText, a.x, a.y, adultH, a.dir)}
        </div>
      ))}
    </div>
  );
};

// Silence unused-import lint for ensureOriginals helper usage below.
export { formatAge };

export default GooseFamily;
