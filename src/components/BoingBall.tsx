import { useEffect, useRef } from "react";
import {
  getBallPlayDirective,
  getGoosePositions,
  reportBallBump,
  setBallPos,
} from "@/lib/gooseSocial";

/**
 * Classic Amiga "Boing" ball — checkered sphere bouncing across the screen.
 * Drawn entirely in code (no textures), inspired by niklasekstrom/boing_ball_python.
 * Frame-rate independent via delta-time.
 */
const BoingBall = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const BASE_GOOSE_COLLISION_PADDING = 30;
    const BASE_BUMP_VELOCITY_X = 260;
    const BASE_BUMP_VELOCITY_Y_SCALE = 180;
    const BASE_BUMP_UPWARD_LIFT = 140;
    const BASE_FLOOR_PADDING = 8;
    const BASE_LIVELY_BOUNCE_THRESHOLD = 120;
    const BASE_LIVELY_BOUNCE_IMPULSE = 900;

    const radius = () => BASE_RADIUS * sceneScale;
    const gooseCollisionPadding = () => BASE_GOOSE_COLLISION_PADDING * sceneScale;
    const bumpVelocityX = () => BASE_BUMP_VELOCITY_X * sceneScale;
    const bumpVelocityYScale = () => BASE_BUMP_VELOCITY_Y_SCALE * sceneScale;
    const bumpUpwardLift = () => BASE_BUMP_UPWARD_LIFT * sceneScale;
    const floorY = () => stageHeight - BASE_FLOOR_PADDING * sceneScale;

    let x = stageWidth * 0.3;
    let y = stageHeight * 0.3;
    let vx = BASE_VX * sceneScale;
    let vy = 0;

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
    };
    resize();
    let ro: ResizeObserver | null = null;
    if (stageEl) {
      ro = new ResizeObserver(resize);
      ro.observe(stageEl);
    } else {
      window.addEventListener("resize", resize);
    }

    const gravity = () => BASE_GRAVITY * sceneScale;
    const bounce = 0.94;
    // Goose sprites are visibly wider than the ball radius, so extend contact
    // distance to keep bumps feeling sprite-to-ball instead of pixel-perfect.
    const BUMP_COOLDOWN_MS = 260;

    let spin = 0; // rotation around tilted axis (radians)
    let spinDir = 1;
    let lastGooseBumpAt = 0;

    // Sphere mesh resolution
    const LAT = 8; // bands (latitude segments) -> 8 stripes
    const LON = 16; // meridians

    // Axis tilt (~23 degrees, classic boing lean)
    const TILT = (23 * Math.PI) / 180;
    const cosT = Math.cos(TILT);
    const sinT = Math.sin(TILT);

    const RED = "#d6175a";
    const WHITE = "#f2f2f2";

    let raf = 0;
    let last = performance.now();

    const drawBall = (cx: number, cy: number, r: number, squash: number) => {
      const rx = r * (1 + squash * 0.18);
      const ry = r * (1 - squash * 0.28);

      // Shadow ellipse on floor
      const floor = floorY();
      const shadowY = floor;
      const shadowScale = Math.max(0.35, 1 - (floor - cy) / (stageHeight * 0.9));
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(cx, shadowY, r * 0.95 * shadowScale, r * 0.22 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Precompute vertices (lat x lon grid + poles handled implicitly).
      // For each quad, decide visibility by average normal z and fill with checker color.
      ctx.save();
      ctx.scale(dpr, dpr);

      type V = { x: number; y: number; z: number };
      const verts: V[][] = [];
      for (let i = 0; i <= LAT; i++) {
        const theta = (i / LAT) * Math.PI; // 0..PI (latitude)
        const sinTh = Math.sin(theta);
        const cosTh = Math.cos(theta);
        const row: V[] = [];
        for (let j = 0; j <= LON; j++) {
          const phi = (j / LON) * Math.PI * 2 + spin; // longitude, animated by spin
          const px = sinTh * Math.cos(phi);
          const py = cosTh;
          const pz = sinTh * Math.sin(phi);
          // Apply tilt around Z axis (lean)
          const rxv = px * cosT - py * sinT;
          const ryv = px * sinT + py * cosT;
          row.push({ x: rxv, y: ryv, z: pz });
        }
        verts.push(row);
      }

      // Sort by depth not needed since back-face cull + paint order works for convex sphere.
      for (let i = 0; i < LAT; i++) {
        for (let j = 0; j < LON; j++) {
          const a = verts[i][j];
          const b = verts[i][j + 1];
          const c = verts[i + 1][j + 1];
          const d = verts[i + 1][j];
          const avgZ = (a.z + b.z + c.z + d.z) / 4;
          if (avgZ < 0) continue; // backface

          // Skip top/bottom poles? Keep them — top/bottom rows are solid white.
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
          // Subtle shading via depth
          const shade = 1 - Math.max(0, avgZ) * 0.0;
          if (shade < 1) {
            ctx.fillStyle = `rgba(0,0,0,${(1 - shade) * 0.4})`;
            ctx.fill();
          }
        }
      }

      // Outer rim shading for 3D feel
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
      const directive = getBallPlayDirective();
      // While the geese are playing, calm the ball down so it stays nearby
      // and the geese can actually catch up to it: less gravity, no lively
      // re-bounce boost, and a gentle horizontal friction.
      const playing = !!directive;
      const effectiveGravity = playing ? gravity() * (380 / BASE_GRAVITY) : gravity();
      vy += effectiveGravity * dt;
      if (playing) {
        vx *= Math.pow(0.55, dt); // ~friction toward 0
      }
      x += vx * dt;
      y += vy * dt;

      const floor = floorY();
      if (x - r < 0) {
        x = r;
        vx = Math.abs(vx);
        spinDir = -1;
      } else if (x + r > stageWidth) {
        x = stageWidth - r;
        vx = -Math.abs(vx);
        spinDir = 1;
      }
      if (y + r > floor) {
        y = floor - r;
        vy = -Math.abs(vy) * bounce;
        if (!playing && Math.abs(vy) < BASE_LIVELY_BOUNCE_THRESHOLD * sceneScale) {
          vy = -BASE_LIVELY_BOUNCE_IMPULSE * sceneScale; // keep it lively outside play
        }
        squash = 0.6;
      }

      if (y - r < 0) {
        y = r;
        vy = Math.abs(vy);
      }

      // Squash decays
      // (approximation: based on vy magnitude near floor)
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
          if (dist <= collisionRadius && now - lastGooseBumpAt > BUMP_COOLDOWN_MS) {
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
      }

      spin += spinDir * 1.8 * dt;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBall(x, y, r, squash);

      // Publish position so the geese can react to / play with the ball.
      setBallPos({ x, y });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
      setBallPos(null);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 6 }}
    />
  );
};

export default BoingBall;
