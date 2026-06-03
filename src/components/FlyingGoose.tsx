import { useEffect, useRef } from "react";

/**
 * Pixel-art goose drawn entirely in code (no image asset), inspired by a
 * classic flying-goose sprite-sheet. Wanders the viewport with smooth,
 * lifelike heading drift, banking turns, and edge-aware steering. Head
 * always leads (horizontal flip + slight pitch rotation).
 */

// --- Sprite definition ---------------------------------------------------
// Each frame is a 20x14 grid of single-character pixel codes.
// Legend:  . = transparent  K = outline (near-black)  W = white body
//          G = grey wing underside  O = orange (beak/feet)  E = eye (black)
//
// The goose faces RIGHT by default. Four wing poses for a flap cycle:
//   0: wings up      1: wings mid-down   2: wings down    3: wings mid-up
const FRAMES: string[][] = [
  // 0 — wings up high
  [
    "....KK..............",
    "...KWWK.............",
    "..KWWWWK............",
    "..KWWWWWK...........",
    "...KWWWWWKK.........",
    "....KWWWWWWKKKK.....",
    ".....KWWWWWWWWWKKKKO",
    "......KWWWWWWWWWEWKO",
    ".......KWWWWWWWWWKK.",
    "........KWWWWWWWK...",
    ".........KOKKOK.....",
    "..........O..O......",
    "....................",
    "....................",
  ],
  // 1 — wings mid-down
  [
    "....................",
    "....................",
    "....KKKK............",
    "...KWWWWKK..........",
    "..KWWWWWWWKKKK......",
    "...KWWWWWWWWWWKKKKO.",
    "....KWWWWWWWWWEWKO..",
    ".....KWGWWWWWWWKK...",
    "......KGGWWWWWK.....",
    ".......KGGGGGK......",
    "........KOKKOK......",
    "..........O..O......",
    "....................",
    "....................",
  ],
  // 2 — wings down (extended)
  [
    "....................",
    "....................",
    "....................",
    "....KKKKK...........",
    "...KWWWWWKKKKK......",
    "....KWWWWWWWWWKKKKO.",
    ".....KWWWWWWWWWEWKO.",
    "......KGWWWWWWWWKK..",
    ".....KGGWWWWWWWK....",
    "....KGGGGWWWWWK.....",
    "...KGGGGGGGGGK......",
    "....KOKKOK..........",
    "......O..O..........",
    "....................",
  ],
  // 3 — wings mid-up
  [
    "....................",
    "....KK..............",
    "...KWWK.............",
    "...KWWWKK...........",
    "....KWWWWKKKK.......",
    ".....KWWWWWWWKKKKO..",
    "......KWWWWWWWWWEWKO",
    ".......KWWWWWWWWKK..",
    "........KWWWWWWK....",
    ".........KWWWWK.....",
    "..........KOKKOK....",
    "............O..O....",
    "....................",
    "....................",
  ],
];

const COLORS: Record<string, string> = {
  K: "#1a1a1a",
  W: "#ffffff",
  G: "#c9cdd2",
  O: "#ff8a1f",
  E: "#1a1a1a",
};

const PIXEL = 3; // px per sprite pixel
const FRAME_W = 20;
const FRAME_H = 14;
const SPRITE_W = FRAME_W * PIXEL;
const SPRITE_H = FRAME_H * PIXEL;

function buildFrameSvgs(): string[] {
  return FRAMES.map((rows) => {
    const rects: string[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        const color = COLORS[c];
        if (!color) continue;
        rects.push(
          `<rect x="${x * PIXEL}" y="${y * PIXEL}" width="${PIXEL}" height="${PIXEL}" fill="${color}"/>`,
        );
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_W}" height="${SPRITE_H}" viewBox="0 0 ${SPRITE_W} ${SPRITE_H}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
  });
}

const FlyingGoose = () => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const frames = buildFrameSvgs().map(
      (svg) => "data:image/svg+xml;utf8," + encodeURIComponent(svg),
    );

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    // State
    let x = Math.random() * w;
    let y = h * (0.2 + Math.random() * 0.4);
    let heading = Math.random() * Math.PI * 2;
    let targetHeading = heading;
    let speed = 110; // px/s
    let targetSpeed = speed;
    let frameIdx = 0;
    let frameAccum = 0;
    let nextDriftAt = 0;
    let nextBankAt = 800 + Math.random() * 2200;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;

    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return;
    img.src = frames[0];

    const tick = (now: number) => {
      const dtMs = Math.min(64, now - last);
      last = now;
      const dt = dtMs / 1000;
      elapsed += dtMs;

      // Drift target heading gently (Perlin-ish via tiny random nudges)
      if (elapsed >= nextDriftAt) {
        targetHeading += (Math.random() - 0.5) * 0.6;
        nextDriftAt = elapsed + 400 + Math.random() * 500;
      }
      // Occasional banking turn
      if (elapsed >= nextBankAt) {
        const turn = (Math.PI / 180) * (60 + Math.random() * 80);
        targetHeading += (Math.random() < 0.5 ? -1 : 1) * turn;
        targetSpeed = 80 + Math.random() * 90;
        nextBankAt = elapsed + 3500 + Math.random() * 5000;
      }

      // Edge avoidance — steer back toward center when near bounds
      const margin = 80;
      if (x < margin || x > w - margin || y < margin || y > h - margin) {
        const cx = w / 2;
        const cy = h / 2;
        const inward = Math.atan2(cy - y, cx - x);
        // Blend target toward inward heading
        targetHeading = inward + (Math.random() - 0.5) * 0.4;
      }

      // Smoothly approach target heading (shortest angular path)
      let dh = ((targetHeading - heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dh < -Math.PI) dh += Math.PI * 2;
      const turnRate = (reducedMotion ? 0.6 : 1.4) * dt;
      heading += Math.max(-turnRate, Math.min(turnRate, dh));

      // Ease speed
      speed += (targetSpeed - speed) * Math.min(1, dt * 1.2);

      // Subtle vertical bob (flap glide)
      const bob = Math.sin(elapsed / 380) * 14 * dt;

      // Integrate
      const vx = Math.cos(heading) * speed;
      const vy = Math.sin(heading) * speed + bob * 4;
      x += vx * dt;
      y += vy * dt;

      // Safety clamp (in case of resize)
      x = Math.max(-SPRITE_W, Math.min(w + SPRITE_W, x));
      y = Math.max(-SPRITE_H, Math.min(h + SPRITE_H, y));

      // Wing flap — frame rate ties to current speed
      const flapHz = reducedMotion ? 3 : 4 + speed / 60; // ~5-8 Hz
      frameAccum += dtMs;
      const frameDur = 1000 / flapHz;
      if (frameAccum >= frameDur) {
        frameIdx = (frameIdx + 1) % FRAMES.length;
        frameAccum = 0;
        img.src = frames[frameIdx];
      }

      // Facing: flip horizontally when traveling leftward; pitch up/down
      // slightly so head leads. Goose sprite faces right by default.
      const facingLeft = Math.cos(heading) < 0;
      // Pitch: derive from vertical component of velocity. Clamp to ±22°.
      let pitch = Math.atan2(vy, Math.abs(vx)) * (180 / Math.PI);
      pitch = Math.max(-22, Math.min(22, pitch));
      // When flipped, invert pitch sign so the visual nose still points
      // in travel direction.
      const visualRot = facingLeft ? -pitch : pitch;
      const scaleX = facingLeft ? -1 : 1;

      wrap.style.transform = `translate3d(${x - SPRITE_W / 2}px, ${y - SPRITE_H / 2}px, 0) rotate(${visualRot}deg) scaleX(${scaleX})`;

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 60 }}
      aria-hidden
    >
      <div
        ref={wrapRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: SPRITE_W,
          height: SPRITE_H,
          willChange: "transform",
          transformOrigin: "center center",
          filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.25))",
        }}
      >
        <img
          ref={imgRef}
          alt=""
          width={SPRITE_W}
          height={SPRITE_H}
          style={{ imageRendering: "pixelated", display: "block" }}
        />
      </div>
    </div>
  );
};

export default FlyingGoose;
