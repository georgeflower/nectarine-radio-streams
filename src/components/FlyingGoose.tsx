import { useEffect, useRef } from "react";

/**
 * Pixel-art goose drawn entirely in code (no image asset). Wanders the viewport
 * with smooth heading drift and banking turns. Periodically perches on title
 * letters (elements with `data-goose-letter`) in the on-screen info bar. While
 * perched, head looks side-to-side with subtle idle motion. If the letter it's
 * sitting on disappears or changes, the goose startles, shouts "WHATTA!!" and
 * takes off again.
 */

// --- Sprite definition ---------------------------------------------------
// Each frame is a 20x14 grid of single-character pixel codes.
// Legend:  . = transparent  K = outline  W = white body  G = grey wing
//          O = orange beak/feet  E = eye
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
  // 4 — STANDING: wings folded against body, feet planted, head up
  [
    "....................",
    "....................",
    "...KK...............",
    "..KWWK..............",
    "..KWWWKKK...........",
    "...KWWWWWKKKK.......",
    "....KWWWWWWWWEWKKO..",
    "....KWWWWWWWWWWWWKO.",
    "....KWGGGGGGGGWWK...",
    "....KWGGGGGGGGGK....",
    "....KWGGGGGGGGK.....",
    ".....KKKKKKKKK......",
    ".......O....O.......",
    ".......O....O.......",
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
const STAND_FRAME = 4;

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

type Mode = "fly" | "approach" | "land" | "startle";

const FlyingGoose = () => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

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

    // Flight state
    let x = Math.random() * w;
    let y = h * (0.2 + Math.random() * 0.4);
    let heading = Math.random() * Math.PI * 2;
    let targetHeading = heading;
    let speed = 110;
    let targetSpeed = speed;
    let frameIdx = 0;
    let frameAccum = 0;
    let nextDriftAt = 0;
    let nextBankAt = 800 + Math.random() * 2200;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;

    // Perch state
    let mode: Mode = "fly";
    let perchEl: HTMLElement | null = null;
    let perchChar = "";
    let nextPerchAt = 6000 + Math.random() * 7000;
    let takeoffAt = 0;
    let nextLookAt = 0;
    let lookDir: 1 | -1 = 1;
    let startleEnd = 0;
    let landingFacingLeft = false;

    const wrap = wrapRef.current;
    const img = imgRef.current;
    const bubble = bubbleRef.current;
    if (!wrap || !img || !bubble) return;
    img.src = frames[0];

    const pickPerch = (): { el: HTMLElement; char: string } | null => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>("[data-goose-letter]"),
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 6 && r.height > 6 && r.top > 40 && r.bottom < h - 20;
      });
      if (candidates.length === 0) return null;
      const el = candidates[Math.floor(Math.random() * candidates.length)];
      return { el, char: el.getAttribute("data-goose-letter") || "" };
    };

    const showBubble = (show: boolean) => {
      bubble.style.opacity = show ? "1" : "0";
      bubble.style.transform = show ? "scale(1)" : "scale(0.7)";
    };

    const setLanded = () => {
      const r = perchEl!.getBoundingClientRect();
      landingFacingLeft = Math.random() < 0.5;
      lookDir = landingFacingLeft ? -1 : 1;
      img.src = frames[STAND_FRAME];
      takeoffAt = elapsed + 6000 + Math.random() * 7000;
      nextLookAt = elapsed + 700 + Math.random() * 900;
      // Snap to letter
      x = r.left + r.width / 2;
      y = r.top - SPRITE_H / 2;
    };

    const startle = () => {
      mode = "startle";
      startleEnd = elapsed + 1400;
      img.src = frames[STAND_FRAME];
      showBubble(true);
      // shake direction prep — keep facing as was
    };

    const takeoff = () => {
      mode = "fly";
      perchEl = null;
      showBubble(false);
      // Pop upward with a heading away from edges
      heading = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      targetHeading = heading;
      speed = 180;
      targetSpeed = 130;
      nextPerchAt = elapsed + 7000 + Math.random() * 9000;
      frameIdx = 2;
      img.src = frames[frameIdx];
    };

    const tick = (now: number) => {
      const dtMs = Math.min(64, now - last);
      last = now;
      const dt = dtMs / 1000;
      elapsed += dtMs;

      // ===== Validate perch (used by land + startle) =====
      const perchAlive = () =>
        !!perchEl &&
        perchEl.isConnected &&
        (perchEl.getAttribute("data-goose-letter") || "") === perchChar &&
        perchEl.textContent === perchChar;

      if (mode === "land") {
        if (!perchAlive()) {
          startle();
        } else {
          const r = perchEl!.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const topY = r.top;
          // Head look toggling
          if (elapsed >= nextLookAt) {
            lookDir = (lookDir === 1 ? -1 : 1) as 1 | -1;
            nextLookAt = elapsed + 700 + Math.random() * 1200;
          }
          const idleBob = Math.sin(elapsed / 320) * 0.8;
          const idleSway = Math.sin(elapsed / 540) * 0.6;
          // Feet sit on top of letter
          const tx = cx - SPRITE_W / 2 + idleSway;
          const ty = topY - SPRITE_H + 2 + idleBob;
          wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0) scaleX(${lookDir})`;
          if (elapsed >= takeoffAt) takeoff();
          raf = requestAnimationFrame(tick);
          return;
        }
      }

      if (mode === "startle") {
        // Freeze position roughly where it was; shake bubble + sprite
        const shake = Math.sin(elapsed / 35) * 2;
        const baseX = x - SPRITE_W / 2 + shake;
        const baseY = y - SPRITE_H / 2;
        wrap.style.transform = `translate3d(${baseX}px, ${baseY}px, 0) scaleX(${lookDir})`;
        // Position bubble above
        bubble.style.left = `${x}px`;
        bubble.style.top = `${y - SPRITE_H / 2 - 8}px`;
        if (elapsed >= startleEnd) takeoff();
        raf = requestAnimationFrame(tick);
        return;
      }

      // ===== FLY / APPROACH =====
      if (mode === "fly" && elapsed >= nextPerchAt) {
        const p = pickPerch();
        if (p) {
          perchEl = p.el;
          perchChar = p.char;
          mode = "approach";
        } else {
          nextPerchAt = elapsed + 4000 + Math.random() * 4000;
        }
      }

      if (mode === "approach") {
        if (!perchAlive()) {
          mode = "fly";
          nextPerchAt = elapsed + 5000 + Math.random() * 6000;
        } else {
          const r = perchEl!.getBoundingClientRect();
          const tx = r.left + r.width / 2;
          const ty = r.top - SPRITE_H / 2 + 2;
          // Ease toward landing point
          const k = Math.min(1, dt * 2.4);
          x += (tx - x) * k;
          y += (ty - y) * k;
          // Facing
          const facingLeft = tx < x - 1;
          const scaleX = facingLeft ? -1 : 1;
          // Flap while approaching (slower)
          frameAccum += dtMs;
          const frameDur = 1000 / 5;
          if (frameAccum >= frameDur) {
            frameIdx = (frameIdx + 1) % 4;
            frameAccum = 0;
            img.src = frames[frameIdx];
          }
          wrap.style.transform = `translate3d(${x - SPRITE_W / 2}px, ${y - SPRITE_H / 2}px, 0) scaleX(${scaleX})`;
          // Arrived?
          if (Math.hypot(tx - x, ty - y) < 3) {
            mode = "land";
            setLanded();
          }
          raf = requestAnimationFrame(tick);
          return;
        }
      }

      // === Normal flying ===
      if (elapsed >= nextDriftAt) {
        targetHeading += (Math.random() - 0.5) * 0.6;
        nextDriftAt = elapsed + 400 + Math.random() * 500;
      }
      if (elapsed >= nextBankAt) {
        const turn = (Math.PI / 180) * (60 + Math.random() * 80);
        targetHeading += (Math.random() < 0.5 ? -1 : 1) * turn;
        targetSpeed = 80 + Math.random() * 90;
        nextBankAt = elapsed + 3500 + Math.random() * 5000;
      }

      const margin = 80;
      if (x < margin || x > w - margin || y < margin || y > h - margin) {
        const cx = w / 2;
        const cy = h / 2;
        const inward = Math.atan2(cy - y, cx - x);
        targetHeading = inward + (Math.random() - 0.5) * 0.4;
      }

      let dh = ((targetHeading - heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dh < -Math.PI) dh += Math.PI * 2;
      const turnRate = (reducedMotion ? 0.6 : 1.4) * dt;
      heading += Math.max(-turnRate, Math.min(turnRate, dh));

      speed += (targetSpeed - speed) * Math.min(1, dt * 1.2);

      const bob = Math.sin(elapsed / 380) * 14 * dt;
      const vx = Math.cos(heading) * speed;
      const vy = Math.sin(heading) * speed + bob * 4;
      x += vx * dt;
      y += vy * dt;
      x = Math.max(-SPRITE_W, Math.min(w + SPRITE_W, x));
      y = Math.max(-SPRITE_H, Math.min(h + SPRITE_H, y));

      const flapHz = reducedMotion ? 3 : 4 + speed / 60;
      frameAccum += dtMs;
      const frameDur = 1000 / flapHz;
      if (frameAccum >= frameDur) {
        frameIdx = (frameIdx + 1) % 4;
        frameAccum = 0;
        img.src = frames[frameIdx];
      }

      const facingLeft = Math.cos(heading) < 0;
      let pitch = Math.atan2(vy, Math.abs(vx)) * (180 / Math.PI);
      pitch = Math.max(-22, Math.min(22, pitch));
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
      {/* Startle speech bubble */}
      <div
        ref={bubbleRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "scale(0.7)",
          transformOrigin: "left bottom",
          opacity: 0,
          transition: "opacity 120ms ease-out, transform 160ms cubic-bezier(0.34,1.56,0.64,1)",
          padding: "4px 10px",
          background: "#fff",
          color: "#1a1a1a",
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          letterSpacing: "0.04em",
          border: "2px solid #1a1a1a",
          borderRadius: 8,
          boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
          whiteSpace: "nowrap",
          translate: "8px -100%",
        }}
      >
        WHATTA!!
      </div>
    </div>
  );
};

export default FlyingGoose;
