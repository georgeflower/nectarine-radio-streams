// Eggs + goslings overlay. Lives alongside the two FlyingGoose instances.
// Listens for snack-break events from gooseSocial; when both adults sit down
// there is a chance the white goose lays 1–3 eggs which hatch on a wall-clock
// timer (45–90s) into goslings that waddle around on the floor.

import { useEffect, useRef, useState } from "react";
import {
  getGoosePositions,
  subscribeFamilyEvents,
  type GooseRole,
} from "@/lib/gooseSocial";
import {
  BASE_SPRITE_H,
  BASE_SPRITE_W,
  buildGooseFrameDataUrls,
  STAND_BODY,
  STAND_HEAD,
} from "@/lib/gooseSprite";
import { getSceneScale } from "@/lib/gooseScene";

const STORAGE_EGGS = "cracktro-goose-eggs-v1";
const HATCH_MIN_MS = 45_000;
const HATCH_MAX_MS = 90_000;
const EGG_LAY_CHANCE = 0.55;
const MAX_GOSLINGS = 6;
const GOSLING_SCALE_FACTOR = 0.58;

// Ground waddle constants (ported from GooseLifeSimulation).
const WADDLE_CHAR_CYCLE_FREQ = 0.55;
const WADDLE_CHAR_BODY_SWAY = 5.4;
const WADDLE_CHAR_BODY_BOB = 4.2;
const WADDLE_CHAR_BODY_TILT = 9.6;
const WADDLE_CHAR_HEAD_SWAY = 6.6;
const WADDLE_CHAR_HEAD_DIP = 5.2;
const WADDLE_CHAR_HEAD_TILT = 27;

type Egg = { id: string; x: number; y: number; laidAt: number; hatchAt: number };
type Gosling = {
  id: string;
  variant: "gosling-white" | "gosling-brown";
  x: number;
  y: number;
  dir: 1 | -1;
  phase: number;
  targetX: number;
  bornAt: number;
  bubbleUntil: number;
};

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function loadEggs(): Egg[] {
  try {
    const raw = localStorage.getItem(STORAGE_EGGS);
    if (!raw) return [];
    const data = JSON.parse(raw) as Egg[];
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e) => e && typeof e.hatchAt === "number" && e.hatchAt > Date.now() - 5 * 60_000,
    );
  } catch {
    return [];
  }
}

function saveEggs(eggs: Egg[]) {
  try {
    localStorage.setItem(STORAGE_EGGS, JSON.stringify(eggs));
  } catch {
    /* ignore */
  }
}

const GooseFamily = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const eggsRef = useRef<Egg[]>(loadEggs());
  const goslingsRef = useRef<Gosling[]>([]);
  const [, setTick] = useState(0);

  // Pre-build sprite frames for both gosling variants.
  const goslingFramesWhite = useRef<string[] | null>(null);
  const goslingFramesBrown = useRef<string[] | null>(null);
  if (!goslingFramesWhite.current) goslingFramesWhite.current = buildGooseFrameDataUrls("gosling-white");
  if (!goslingFramesBrown.current) goslingFramesBrown.current = buildGooseFrameDataUrls("gosling-brown");

  // Subscribe to snack-break events. Lay eggs with some probability.
  useEffect(() => {
    const unsub = subscribeFamilyEvents((event) => {
      if (event.type !== "snack-start") return;
      const positions = event.positions ?? getGoosePositions();
      const anchor = positions?.white ?? positions?.brown;
      if (!anchor) return;
      if (Math.random() > EGG_LAY_CHANCE) return;
      const count = 1 + Math.floor(Math.random() * 3);
      const now = Date.now();
      const fresh: Egg[] = [];
      for (let i = 0; i < count; i++) {
        fresh.push({
          id: `egg-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          x: anchor.x + rand(-22, 22),
          y: anchor.y + rand(8, 22),
          laidAt: now,
          hatchAt: now + rand(HATCH_MIN_MS, HATCH_MAX_MS),
        });
      }
      eggsRef.current = [...eggsRef.current, ...fresh];
      saveEggs(eggsRef.current);
      setTick((t) => t + 1);
    });
    return unsub;
  }, []);

  // Animation loop: hatch eggs, waddle goslings, repaint.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;

      const root = rootRef.current;
      const w = root?.clientWidth ?? window.innerWidth;
      const h = root?.clientHeight ?? window.innerHeight;
      const sceneScale = getSceneScale(w, h);
      const floorY = h - BASE_SPRITE_H * sceneScale * GOSLING_SCALE_FACTOR * 0.6 - 12;

      // Hatch eggs.
      const wall = Date.now();
      const stillEggs: Egg[] = [];
      let mutated = false;
      for (const egg of eggsRef.current) {
        if (wall >= egg.hatchAt && goslingsRef.current.length < MAX_GOSLINGS) {
          const positions = getGoosePositions();
          const anchor = positions?.white ?? positions?.brown ?? { x: egg.x, y: floorY };
          const variant: "gosling-white" | "gosling-brown" =
            Math.random() < 0.5 ? "gosling-white" : "gosling-brown";
          goslingsRef.current.push({
            id: `g-${wall}-${Math.random().toString(36).slice(2, 6)}`,
            variant,
            x: egg.x,
            y: floorY,
            dir: anchor.x < egg.x ? -1 : 1,
            phase: Math.random() * Math.PI * 2,
            targetX: anchor.x + rand(-30, 30),
            bornAt: wall,
            bubbleUntil: wall + 2200,
          });
          mutated = true;
        } else {
          stillEggs.push(egg);
        }
      }
      if (mutated) {
        eggsRef.current = stillEggs;
        saveEggs(stillEggs);
      }

      // Waddle goslings toward a parent (or wander) along the floor.
      const positions = getGoosePositions();
      const parentAnchor = positions?.white ?? positions?.brown ?? null;
      for (const g of goslingsRef.current) {
        // Re-target every ~3-5s or when close.
        if (Math.abs(g.targetX - g.x) < 14) {
          const base = parentAnchor?.x ?? w / 2;
          g.targetX = base + rand(-90, 90);
        }
        const desiredDir: 1 | -1 = g.targetX > g.x ? 1 : -1;
        g.dir = desiredDir;
        const speed = 36 * sceneScale; // px/s — slow toddling
        g.x += desiredDir * speed * dt;
        g.x = Math.max(20, Math.min(w - 20, g.x));
        g.y = floorY;
        g.phase += dt;
      }

      setTick((t) => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const root = rootRef.current;
  const w = root?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
  const h = root?.clientHeight ?? (typeof window !== "undefined" ? window.innerHeight : 768);
  const sceneScale = getSceneScale(w, h);
  const goslingW = BASE_SPRITE_W * sceneScale * GOSLING_SCALE_FACTOR;
  const goslingH = BASE_SPRITE_H * sceneScale * GOSLING_SCALE_FACTOR;
  const now = Date.now();

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
        const stepCycle = Math.sin(phase * WADDLE_CHAR_CYCLE_FREQ * Math.PI * 2);
        const stepLanding = Math.abs(stepCycle);
        const bodyTX = stepCycle * WADDLE_CHAR_BODY_SWAY * sceneScale * GOSLING_SCALE_FACTOR;
        const bodyTY = stepLanding * WADDLE_CHAR_BODY_BOB * sceneScale * GOSLING_SCALE_FACTOR;
        const bodyTilt = stepCycle * WADDLE_CHAR_BODY_TILT;
        const headTX = Math.sin(phase * WADDLE_CHAR_CYCLE_FREQ * Math.PI * 2 * 0.9) * WADDLE_CHAR_HEAD_SWAY * sceneScale * GOSLING_SCALE_FACTOR;
        const headTY = stepLanding * WADDLE_CHAR_HEAD_DIP * sceneScale * GOSLING_SCALE_FACTOR;
        const headTilt = Math.sin(phase * WADDLE_CHAR_CYCLE_FREQ * Math.PI * 2 * 1.1) * WADDLE_CHAR_HEAD_TILT;
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
            <img
              src={frames[STAND_BODY]}
              alt=""
              width={goslingW}
              height={goslingH}
              style={{
                position: "absolute",
                inset: 0,
                width: goslingW,
                height: goslingH,
                imageRendering: "pixelated",
                transform: `translate(${bodyTX}px, ${bodyTY}px) rotate(${bodyTilt}deg)`,
              }}
            />
            <img
              src={frames[STAND_HEAD]}
              alt=""
              width={goslingW}
              height={goslingH}
              style={{
                position: "absolute",
                inset: 0,
                width: goslingW,
                height: goslingH,
                imageRendering: "pixelated",
                transformOrigin: "center center",
                transform: `translate(${headTX}px, ${headTY}px) rotate(${headTilt}deg)`,
              }}
            />
            {bubble && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: -22,
                  transform: "translateX(-50%) scaleX(" + g.dir + ")",
                  padding: "2px 8px",
                  background: "#fff",
                  color: "#1a1a1a",
                  fontWeight: 900,
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 11,
                  border: "2px solid #1a1a1a",
                  borderRadius: 6,
                  whiteSpace: "nowrap",
                  boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
                }}
              >
                Peep! 🐣
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GooseFamily;
