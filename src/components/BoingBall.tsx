import { useEffect, useRef } from "react";
import {
  getBallPlayDirective,
  getGoosePositions,
  reportBallBump,
  setBallAvailable,
  setBallPos,
  subscribeFamilyEvents,
} from "@/lib/gooseSocial";
import { getQuarterPeriodMs } from "@/lib/gooseBeat";

/**
 * Classic Amiga "Boing" ball — checkered sphere bouncing across the screen.
 * Drawn entirely in code (no textures), inspired by niklasekstrom/boing_ball_python.
 * Frame-rate independent via delta-time.
 *
 * While the mother goose is on the nest (incubation-start) the ball flies
 * off to a small shelf in the upper right corner and shrinks to 15 % of its
 * original size, simulating it going far away. When the brood ends (all
 * goslings have grown to adults), the ball returns and the shelf retracts.
 */
const BoingBall = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shelfRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stageEl = canvas.parentElement;
    const stageW = () => (stageEl ? stageEl.clientWidth : window.innerWidth);
    const stageH = () => (stageEl ? stageEl.clientHeight : window.innerHeight);

    const REF_MIN_DIM = 900;
    const MIN_SCENE_SCALE = 0.55;
    const MAX_SCENE_SCALE = 1.8;
    const sceneScaleFor = (width: number, height: number) =>
      Math.max(MIN_SCENE_SCALE, Math.min(MAX_SCENE_SCALE, Math.min(width, height) / REF_MIN_DIM));

    let stageWidth = stageW();
    let stageHeight = stageH();
    let sceneScale = sceneScaleFor(stageWidth, stageHeight);

    // Ball state (in CSS px)
    const BASE_RADIUS = 63;
    const BASE_VX = 320;
    const BASE_GRAVITY = 650;
    const BASE_PLAY_GRAVITY = 380;
    const PLAY_GRAVITY_RATIO = BASE_PLAY_GRAVITY / BASE_GRAVITY;
    const BASE_GOOSE_COLLISION_PADDING = 42;
    const BASE_BUMP_VELOCITY_X = 260;
    const BASE_BUMP_VELOCITY_Y_SCALE = 180;
    const BASE_BUMP_UPWARD_LIFT = 140;
    const BASE_FLOOR_PADDING = 8;
    const BASE_LIVELY_BOUNCE_THRESHOLD = 120;
    const BASE_LIVELY_BOUNCE_IMPULSE = 900;
    const BASE_MIN_APPROACH_PADDING = 6;
    const APPROACH_PADDING_VELOCITY_FACTOR = 0.14;

    const radius = () => BASE_RADIUS * sceneScale;
    const gooseCollisionPadding = () => BASE_GOOSE_COLLISION_PADDING * sceneScale;
    const bumpVelocityX = () => BASE_BUMP_VELOCITY_X * sceneScale;
    const bumpVelocityYScale = () => BASE_BUMP_VELOCITY_Y_SCALE * sceneScale;
    const bumpUpwardLift = () => BASE_BUMP_UPWARD_LIFT * sceneScale;
    const floorY = () => stageHeight - BASE_FLOOR_PADDING * sceneScale;
    const minApproachPadding = () => BASE_MIN_APPROACH_PADDING * sceneScale;

    let x = stageWidth * 0.3;
    let y = stageHeight * 0.3;
    let vx = BASE_VX * sceneScale;
    let vy = 0;

    // Shelf parking state.
    // mode: "live" → normal physics, "parking" → animating to shelf, "parked"
    // → stuck on shelf, "returning" → animating back from shelf.
    type ParkMode = "live" | "parking" | "parked" | "returning";
    let parkMode: ParkMode = "live";
    let parkT = 0; // 0..1 progress
    const PARK_DURATION = 1.2; // seconds
    const RETURN_DURATION = 0.8;
    const SHELF_SCALE = 0.25;
    let parkStartX = 0, parkStartY = 0;
    const shelfAnchorX = () => stageWidth * 0.82;
    const shelfAnchorY = () => stageHeight * 0.20;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const prevW = Math.max(1, stageWidth);
      const prevH = Math.max(1, stageHeight);
      const prevScale = sceneScale;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      stageWidth = stageW();
      stageHeight = stageH();
      sceneScale = sceneScaleFor(stageWidth, stageHeight);
      canvas.width = Math.floor(stageWidth * dpr);
      canvas.height = Math.floor(stageHeight * dpr);
      canvas.style.width = `${stageWidth}px`;
      canvas.style.height = `${stageHeight}px`;
      const sx = stageWidth / prevW;
      const sy = stageHeight / prevH;
      const s = sceneScale / Math.max(prevScale, 0.0001);
      x *= sx;
      y *= sy;
      vx *= s;
      vy *= s;
      positionShelf();
    };

    const positionShelf = () => {
      const shelf = shelfRef.current;
      if (!shelf) return;
      const sx = shelfAnchorX();
      const sy = shelfAnchorY();
      const w = 110 * sceneScale;
      const h = 10 * sceneScale;
      shelf.style.left = `${sx - w / 2}px`;
      shelf.style.top = `${sy + 8 * sceneScale}px`;
      shelf.style.width = `${w}px`;
      shelf.style.height = `${h}px`;
    };

    resize();
    let ro: ResizeObserver | null = null;
    if (stageEl) {
      ro = new ResizeObserver(resize);
      ro.observe(stageEl);
    } else {
      window.addEventListener("resize", resize);
    }

    // Family event subscription drives shelf parking.
    const showShelf = (visible: boolean) => {
      const shelf = shelfRef.current;
      if (!shelf) return;
      shelf.style.transition = visible
        ? "transform 600ms cubic-bezier(0.2,0.8,0.2,1), opacity 600ms ease-out"
        : "transform 500ms cubic-bezier(0.7,0,0.8,0.4), opacity 500ms ease-in";
      shelf.style.transform = visible ? "translateX(0%)" : "translateX(140%)";
      shelf.style.opacity = visible ? "1" : "0";
    };
    showShelf(false);

    const unsubFamily = subscribeFamilyEvents((ev) => {
      if (ev.type === "incubation-start") {
        if (parkMode === "live" || parkMode === "returning") {
          parkMode = "parking";
          parkT = 0;
          parkStartX = x;
          parkStartY = y;
          setBallAvailable(false);
          showShelf(true);
        }
      } else if (ev.type === "brood-end") {
        if (parkMode === "parked" || parkMode === "parking") {
          parkMode = "returning";
          parkT = 0;
          parkStartX = shelfAnchorX();
          parkStartY = shelfAnchorY();
        }
      }
    });

    const gravity = () => BASE_GRAVITY * sceneScale;
    const bounce = 0.94;
    const BUMP_COOLDOWN_MS = 140;

    let spin = 0;
    let spinDir = 1;
    let lastGooseBumpAt = 0;

    // Sphere mesh
    const LAT = 8;
    const LON = 16;
    const TILT = (23 * Math.PI) / 180;
    const cosT = Math.cos(TILT);
    const sinT = Math.sin(TILT);
    const RED = "#d6175a";
    const WHITE = "#f2f2f2";

    let raf = 0;
    let last = performance.now();

    const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const drawBall = (cx: number, cy: number, r: number, squash: number) => {
      const rx = r * (1 + squash * 0.18);
      const ry = r * (1 - squash * 0.28);

      const floor = floorY();
      const shadowY = floor;
      const shadowScale = Math.max(0.35, 1 - (floor - cy) / (stageHeight * 0.9));
      ctx.save();
      ctx.scale(dpr, dpr);
      // Only draw shadow when the ball is near the floor and live-sized.
      if (parkMode === "live" || parkMode === "returning") {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(cx, shadowY, r * 0.95 * shadowScale, r * 0.22 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.scale(dpr, dpr);

      type V = { x: number; y: number; z: number };
      const verts: V[][] = [];
      for (let i = 0; i <= LAT; i++) {
        const theta = (i / LAT) * Math.PI;
        const sinTh = Math.sin(theta);
        const cosTh = Math.cos(theta);
        const row: V[] = [];
        for (let j = 0; j <= LON; j++) {
          const phi = (j / LON) * Math.PI * 2 + spin;
          const px = sinTh * Math.cos(phi);
          const py = cosTh;
          const pz = sinTh * Math.sin(phi);
          const rxv = px * cosT - py * sinT;
          const ryv = px * sinT + py * cosT;
          row.push({ x: rxv, y: ryv, z: pz });
        }
        verts.push(row);
      }

      for (let i = 0; i < LAT; i++) {
        for (let j = 0; j < LON; j++) {
          const a = verts[i][j];
          const b = verts[i][j + 1];
          const c = verts[i + 1][j + 1];
          const d = verts[i + 1][j];
          const avgZ = (a.z + b.z + c.z + d.z) / 4;
          if (avgZ < 0) continue;

          const isPole = i === 0 || i === LAT - 1;
          const checker = (i + j) % 2 === 0;
          const color = isPole ? WHITE : checker ? RED : WHITE;

          ctx.beginPath();
          ctx.moveTo(cx + a.x * rx, cy + a.y * ry);
          ctx.lineTo(cx + b.x * rx, cy + b.y * ry);
          ctx.lineTo(cx + c.x * rx, cy + c.y * ry);
          ctx.lineTo(cx + d.x * rx, cy + d.y * ry);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      const grad = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, rx * 0.2, cx, cy, rx);
      grad.addColorStop(0, "rgba(255,255,255,0.18)");
      grad.addColorStop(0.6, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.restore();
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const r = radius();
      let squash = 0;
      let renderScale = 1;

      if (parkMode === "live") {
        const directive = getBallPlayDirective();
        const playing = !!directive;
        const effectiveGravity = playing ? gravity() * PLAY_GRAVITY_RATIO : gravity();
        vy += effectiveGravity * dt;
        if (playing) vx *= Math.pow(0.55, dt);
        x += vx * dt;
        y += vy * dt;

        const floor = floorY();
        if (x - r < 0) { x = r; vx = Math.abs(vx); spinDir = -1; }
        else if (x + r > stageWidth) { x = stageWidth - r; vx = -Math.abs(vx); spinDir = 1; }
        if (y + r > floor) {
          y = floor - r;
          vy = -Math.abs(vy) * bounce;
          if (!playing && Math.abs(vy) < BASE_LIVELY_BOUNCE_THRESHOLD * sceneScale) {
            vy = -BASE_LIVELY_BOUNCE_IMPULSE * sceneScale;
          }
          squash = 0.6;
        }
        if (y - r < 0) { y = r; vy = Math.abs(vy); }

        const distToFloor = floor - (y + r);
        const nearFloor = Math.max(0, 1 - distToFloor / (r * 0.6));
        squash = Math.max(squash, nearFloor * 0.35);

        if (directive) {
          const positions = getGoosePositions();
          const chaserPos = positions?.[directive.chaser];
          if (chaserPos) {
            const dx = x - chaserPos.x;
            const dy = y - chaserPos.y;
            const dist = Math.hypot(dx, dy);
            const collisionRadius = r + gooseCollisionPadding();
            const approachPadding = Math.max(
              minApproachPadding(),
              Math.hypot(vx, vy) * dt * APPROACH_PADDING_VELOCITY_FACTOR,
            );
            const effectiveCollisionRadius = collisionRadius + approachPadding;
            if (dist <= effectiveCollisionRadius && now - lastGooseBumpAt > BUMP_COOLDOWN_MS) {
              const tx = directive.bumpToward.x - chaserPos.x;
              const ty = directive.bumpToward.y - chaserPos.y;
              const mag = Math.hypot(tx, ty) || 1;
              const ux = tx / mag;
              const uy = ty / mag;
              vx = ux * bumpVelocityX();
              vy = uy * bumpVelocityYScale() - bumpUpwardLift();
              x += ux * (5 * sceneScale);
              y += uy * (5 * sceneScale);
              spinDir = ux < 0 ? 1 : -1;
              lastGooseBumpAt = now;
              reportBallBump(directive.chaser);
            }
          }
        } else {
          const positions = getGoosePositions();
          if (positions && now - lastGooseBumpAt > BUMP_COOLDOWN_MS) {
            for (const role of Object.keys(positions) as Array<keyof typeof positions>) {
              const p = positions[role];
              const dx = x - p.x;
              const dy = y - p.y;
              const dist = Math.hypot(dx, dy);
              if (dist > 0 && dist <= r) {
                const nx = dx / dist;
                const ny = dy / dist;
                const vDotN = vx * nx + vy * ny;
                if (vDotN < 0) {
                  vx = (vx - 2 * vDotN * nx) * bounce;
                  vy = (vy - 2 * vDotN * ny) * bounce;
                }
                const overlap = r - dist + 2;
                x += nx * overlap;
                y += ny * overlap;
                spinDir = nx < 0 ? 1 : -1;
                lastGooseBumpAt = now;
                break;
              }
            }
          }
        }
        spin += spinDir * 1.8 * dt;
      } else if (parkMode === "parking") {
        parkT = Math.min(1, parkT + dt / PARK_DURATION);
        const e = easeInOut(parkT);
        x = parkStartX + (shelfAnchorX() - parkStartX) * e;
        y = parkStartY + (shelfAnchorY() - parkStartY) * e;
        renderScale = 1 + (SHELF_SCALE - 1) * e;
        spin += 2.4 * dt;
        if (parkT >= 1) parkMode = "parked";
      } else if (parkMode === "parked") {
        x = shelfAnchorX();
        y = shelfAnchorY();
        renderScale = SHELF_SCALE;
        spin += 0.6 * dt;
      } else if (parkMode === "returning") {
        parkT = Math.min(1, parkT + dt / RETURN_DURATION);
        const e = easeInOut(parkT);
        const targetX = stageWidth * 0.5;
        const targetY = stageHeight * 0.3;
        x = parkStartX + (targetX - parkStartX) * e;
        y = parkStartY + (targetY - parkStartY) * e;
        renderScale = SHELF_SCALE + (1 - SHELF_SCALE) * e;
        spin += 1.8 * dt;
        if (parkT >= 1) {
          parkMode = "live";
          vx = BASE_VX * sceneScale * (Math.random() < 0.5 ? -1 : 1);
          vy = 0;
          setBallAvailable(true);
          showShelf(false);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBall(x, y, r * renderScale, squash);

      // Only publish position while live so the geese don't chase the tiny
      // far-away ball or react to a parked ball.
      setBallPos(parkMode === "live" ? { x, y } : null);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
      setBallPos(null);
      setBallAvailable(true);
      unsubFamily();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 20 }}
      />
      {/* Far-away shelf the ball parks on while the mother is brooding. */}
      <div
        ref={shelfRef}
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          zIndex: 19,
          background: "linear-gradient(180deg, #6b4a2a 0%, #3a2614 100%)",
          borderTop: "1px solid rgba(255,210,150,0.55)",
          borderBottom: "1px solid rgba(0,0,0,0.6)",
          boxShadow: "0 4px 6px -2px rgba(0,0,0,0.5)",
          transform: "translateX(140%)",
          opacity: 0,
        }}
      />
    </>
  );
};

export default BoingBall;
