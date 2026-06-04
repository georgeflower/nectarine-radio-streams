import { useEffect, useRef } from "react";
import { SMILEYS } from "@/lib/smileys";
import type { OnelinerEntry } from "@/lib/nectarine";

/**
 * Pixel-art goose drawn entirely in code (no image asset). Wanders the viewport
 * and periodically perches on title letters (elements with `data-goose-letter`).
 * Reacts to new oneliner posts: if the post contains a smiley code, the goose
 * mirrors it in a speech bubble; if it contains the word "goose", a giant
 * pixel-art heart pops above the bird.
 */

// --- Sprite definition ---------------------------------------------------
// 16-bit pixel goose. Facing right; flipped via scaleX(-1) when needed.
// Palette: K outline, W white, L belly highlight, G mid shadow,
//          O orange beak/feet, D dark orange (beak shadow), E eye.
// 24 x 18 grid for richer shading than the old 20x14 sprite.

// Common goose body + slim straight neck + small round head w/ eye + beak.
// Identical across all 4 flying frames so the neck stays a consistent width
// and the head reads as an actual goose head. Only wings change per frame.
//
// Layout (cols/rows):
//   body         cols 4-13, rows 6-12
//   neck (slim)  cols 9-14, rows 7-9  (2-row K outline + 1-row L fill)
//   head         cols 15-18, rows 6-10 (with eye at col 16 row 7)
//   beak         cols 19-22, rows 7-9
const FRAMES: string[][] = [
  // 0 — FLY: wings high (upstroke peak).
  [
    "...KK...................",
    "..KGGK..................",
    "..KWWGK.................",
    "..KGWWGK................",
    "...KGWWGK...............",
    "....KGWWGK..............",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
  // 1 — FLY: wings mid-up.
  [
    "........................",
    "...KKK..................",
    "..KGGGK.................",
    "..KGWWGKK...............",
    "...KGWWWGK..............",
    "....KGGWWGK.............",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
  // 2 — FLY: wings level / fully extended out to the side.
  [
    "........................",
    "........................",
    "..KKK...................",
    ".KGGGK..................",
    "KGWWWGK.................",
    ".KGGWWGK................",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
  // 3 — FLY: wings down (downstroke).
  [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "....KGWWGK..............",
    "...KGWWWWGK.............",
    "..KGWWWWWGK.............",
    "..KGWWWGK...............",
    "...KKKK.................",
  ],

  // 4 — STANDING (full sprite, kept for compatibility / fallback)
  [
    "........KKKK............",
    ".......KWWWWK...........",
    ".......KWEWWWKKDO.......",
    ".......KWWWWWKD.........",
    "........KWWWK...........",
    "........KWWK............",
    "........KWWK............",
    ".........KWWK...........",
    ".........KWWK...........",
    "..........KWWK..........",
    "..........KWWWK.........",
    ".........KWWWWWK........",
    "........KWLLLLLWK.......",
    ".......KWLLLLLLLWK......",
    ".......KWLLLLLLLWK......",
    "........KGGGGGGGK.......",
    ".........KKKKKKK........",
    "........O.....O.........",
  ],
  // 5 — STANDING BODY (static layer). No vertical neck collar — the whole
  // neck lives in the head sprite, so when the head turns there are no
  // leftover white pixels behind the rotating head.
  [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "..........KWWK..........",
    ".........KWWWWWK........",
    "........KWLLLLLWK.......",
    ".......KWLLLLLLLWK......",
    ".......KWLLLLLLLWK......",
    "........KGGGGGGGK.......",
    ".........KKKKKKK........",
    "........O.....O.........",
  ],
  // 6 — STANDING HEAD (rotates / sways). Contains the FULL neck so the
  // whole head+neck swings as one rigid piece, pivoting where the neck
  // meets the body (col 11.5, row 10).
  [
    "..........KKKK..........",
    ".........KWWWWK.........",
    ".........KWEWWWKKDO.....",
    ".........KWWWWWKD.......",
    "..........KWWWK.........",
    "..........KWWK..........",
    "..........KWWK..........",
    "..........KWWK..........",
    "..........KWWK..........",
    "..........KWWK..........",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],

];




type GooseVariant = "white" | "brown";

const PALETTES: Record<GooseVariant, Record<string, string>> = {
  white: {
    K: "#1a1a1a",
    W: "#ffffff",
    L: "#e8eaee",
    G: "#b8bcc2",
    O: "#ff8a1f",
    D: "#c95a00",
    E: "#1a1a1a",
  },
  // Warm brown goose: chocolate outline, tan body, cream belly, yellow beak.
  brown: {
    K: "#2a1a0d",
    W: "#8a5a32",
    L: "#e6cfa8",
    G: "#5a3a1f",
    O: "#f2c542",
    D: "#a07020",
    E: "#0d0703",
  },
};

const PIXEL = 3;
const FRAME_W = 24;
const FRAME_H = 18;
const SPRITE_W = FRAME_W * PIXEL;
const SPRITE_H = FRAME_H * PIXEL;
const STAND_FRAME = 4;
const STAND_BODY = 5;
const STAND_HEAD = 6;


function buildFrameSvgs(variant: GooseVariant = "white"): string[] {
  const colors = PALETTES[variant];
  return FRAMES.map((rows) => {
    const rects: string[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        const color = colors[c];
        if (!color) continue;
        rects.push(
          `<rect x="${x * PIXEL}" y="${y * PIXEL}" width="${PIXEL}" height="${PIXEL}" fill="${color}"/>`,
        );
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_W}" height="${SPRITE_H}" viewBox="0 0 ${SPRITE_W} ${SPRITE_H}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
  });
}

// --- Smiley detection ----------------------------------------------------
// Build lookup once; sorted longest-first so e.g. ":facepalm2:" beats ":facepalm:".
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const SMILEY_KEYS = Object.keys(SMILEYS).sort((a, b) => b.length - a.length);
const SMILEY_RE = new RegExp(SMILEY_KEYS.map(escapeRegex).join("|"), "i");
const SMILEY_LC: Record<string, string> = {};
for (const k of SMILEY_KEYS) SMILEY_LC[k.toLowerCase()] = k;

function firstSmileyUrl(text: string): string | null {
  const m = SMILEY_RE.exec(text);
  if (!m) return null;
  const canonical = SMILEY_LC[m[0].toLowerCase()];
  return canonical ? SMILEYS[canonical] : null;
}

// Pixel-art heart SVG (retro 11x10 grid).
const HEART_SVG = (() => {
  const grid = [
    ".RR...RR.",
    "RRRR.RRRR",
    "RRRRRRRRR",
    "RRRRRRRRR",
    "RRRRRRRRR",
    ".RRRRRRR.",
    "..RRRRR..",
    "...RRR...",
    "....R....",
  ];
  const px = 5;
  const W = grid[0].length * px;
  const H = grid.length * px;
  const rects: string[] = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "R") {
        rects.push(
          `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="#ff3355"/>`,
        );
        // pixel outline
        rects.push(
          `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="none" stroke="#1a1a1a" stroke-width="0.6"/>`,
        );
      }
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
})();

type Mode = "fly" | "approach" | "land" | "startle";

type Props = {
  oneliners?: OnelinerEntry[];
  variant?: GooseVariant;
};

const FlyingGoose = ({ oneliners = [], variant = "white" }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgStandBodyRef = useRef<HTMLImageElement | null>(null);
  const imgStandHeadRef = useRef<HTMLImageElement | null>(null);

  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Imperative reaction state shared between effects.
  const reactionUntilRef = useRef<number>(0);
  const lastOnelinerKeyRef = useRef<string | null>(null);

  // React to new oneliner entries.
  useEffect(() => {
    if (!oneliners.length) return;
    const top = oneliners[0];
    const key = `${top.time}|${top.username}|${top.text}`;
    if (lastOnelinerKeyRef.current === null) {
      // First load — don't react retroactively.
      lastOnelinerKeyRef.current = key;
      return;
    }
    if (key === lastOnelinerKeyRef.current) return;
    lastOnelinerKeyRef.current = key;

    const bubble = bubbleRef.current;
    if (!bubble) return;

    const text = top.text || "";
    const mentionsGoose = /\bgoose\b/i.test(text);
    const smileyUrl = firstSmileyUrl(text);

    let content = "";
    if (mentionsGoose) {
      content = `<img src="${HEART_SVG}" alt="heart" style="image-rendering:pixelated;display:block;width:55px;height:auto" />`;
    } else if (smileyUrl) {
      content = `<img src="${smileyUrl}" alt="" style="display:block;height:28px;width:auto" />`;
    } else {
      return;
    }

    bubble.innerHTML = content;
    bubble.style.opacity = "1";
    bubble.style.transform = "scale(1)";
    reactionUntilRef.current = performance.now() + 2600;
  }, [oneliners]);

  useEffect(() => {
    const frames = buildFrameSvgs(variant).map(
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

    // Random helpers for landing/perch cadence.
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const nextPerchDelay = () => rand(8000, 28000); // ms between landings
    const sitDuration = () => rand(5000, 22000); // ms sat on a letter

    // Perch state
    let mode: Mode = "fly";
    let perchEl: HTMLElement | null = null;
    let perchChar = "";
    let perchKind: "letter" | "window" = "letter";
    let perchOffset = 0.5; // horizontal position along perch (0..1)
    let nextPerchAt = nextPerchDelay();
    let takeoffAt = 0;
    let nextLookAt = 0;
    let lookDir: 1 | -1 = 1;
    let lookScale = 1; // animated -1..1, smoothly tweens toward lookDir while standing
    let startleEnd = 0;

    const wrap = wrapRef.current;
    const img = imgRef.current;
    const imgBody = imgStandBodyRef.current;
    const imgHead = imgStandHeadRef.current;
    const bubble = bubbleRef.current;
    if (!wrap || !img || !imgBody || !imgHead || !bubble) return;
    img.src = frames[0];
    imgBody.src = frames[STAND_BODY];
    imgHead.src = frames[STAND_HEAD];



    const pickPerch = ():
      | { el: HTMLElement; char: string; kind: "letter" | "window"; offset: number }
      | null => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-goose-letter], [data-goose-perch]",
        ),
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 6 && r.height > 6 && r.top > 40 && r.bottom < h - 20;
      });
      if (candidates.length === 0) return null;
      const el = candidates[Math.floor(Math.random() * candidates.length)];
      const isLetter = el.hasAttribute("data-goose-letter");
      return {
        el,
        char: isLetter ? el.getAttribute("data-goose-letter") || "" : "",
        kind: isLetter ? "letter" : "window",
        // Letters: dead-center. Windows: random spot along the bar.
        offset: isLetter ? 0.5 : 0.15 + Math.random() * 0.7,
      };
    };

    // Returns the visual landing point (center x, top y of the perch surface)
    // and how much the sprite should sink onto the surface.
    const perchTarget = (): { cx: number; topY: number; sink: number } => {
      const r = perchEl!.getBoundingClientRect();
      const cx = r.left + r.width * perchOffset;
      if (perchKind === "letter") {
        // Letter rect top sits above the visible cap because of line-height.
        return { cx, topY: r.top, sink: 10 };
      }
      // Window title bar — feet rest right on the top edge.
      return { cx, topY: r.top, sink: 2 };
    };

    const showStartleBubble = () => {
      bubble.innerHTML = "WHATTA!!";
      bubble.style.opacity = "1";
      bubble.style.transform = "scale(1)";
      reactionUntilRef.current = performance.now() + 1400;
    };

    const hideBubbleIfExpired = (now: number) => {
      if (reactionUntilRef.current && now >= reactionUntilRef.current) {
        bubble.style.opacity = "0";
        bubble.style.transform = "scale(0.7)";
        reactionUntilRef.current = 0;
      }
    };

    const setLanded = () => {
      const { cx, topY, sink } = perchTarget();
      lookDir = Math.random() < 0.5 ? -1 : 1;
      lookScale = lookDir; // snap on first land — no flip-through-zero on arrival
      // Crossfade from flying sprite to standing (body + head) for a soft settle.
      imgBody.style.opacity = "1";
      imgHead.style.opacity = "1";
      img.style.opacity = "0";
      takeoffAt = elapsed + sitDuration();
      nextLookAt = elapsed + rand(700, 1600);
      x = cx;
      y = topY - SPRITE_H + sink + SPRITE_H / 2;
    };

    const startle = () => {
      mode = "startle";
      startleEnd = elapsed + 1400;
      imgBody.style.opacity = "1";
      imgHead.style.opacity = "1";
      img.style.opacity = "0";
      showStartleBubble();
    };

    const takeoff = () => {
      mode = "fly";
      perchEl = null;
      heading = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      targetHeading = heading;
      speed = 180;
      targetSpeed = 130;
      nextPerchAt = elapsed + nextPerchDelay();
      frameIdx = 2;
      img.src = frames[frameIdx];
      // Fade flying sprite back in, standing layers out.
      img.style.opacity = "1";
      imgBody.style.opacity = "0";
      imgHead.style.opacity = "0";
    };



    const tick = (now: number) => {
      const dtMs = Math.min(64, now - last);
      last = now;
      const dt = dtMs / 1000;
      elapsed += dtMs;

      hideBubbleIfExpired(now);

      const perchAlive = () => {
        if (!perchEl || !perchEl.isConnected) return false;
        if (perchKind === "letter") {
          return (
            (perchEl.getAttribute("data-goose-letter") || "") === perchChar &&
            perchEl.textContent === perchChar
          );
        }
        return perchEl.hasAttribute("data-goose-perch");
      };

      // Reposition the bubble above the goose every frame while visible.
      const positionBubble = (cx: number, cy: number) => {
        if (!reactionUntilRef.current) return;
        bubble.style.left = `${cx}px`;
        bubble.style.top = `${cy - SPRITE_H / 2 - 6}px`;
      };

      if (mode === "land") {
        if (!perchAlive()) {
          startle();
        } else {
          const { cx, topY, sink } = perchTarget();
          if (elapsed >= nextLookAt) {
            lookDir = (lookDir === 1 ? -1 : 1) as 1 | -1;
            nextLookAt = elapsed + rand(1400, 2800);
          }
          // Natural head turn: yaw rotation + tiny lateral sway around the
          // neck base, instead of a mirror flip. Body stays perfectly still.
          lookScale += (lookDir - lookScale) * Math.min(1, dt * 4);
          // Subtle idle micro-wiggle applied to the head only.
          const wiggle =
            Math.sin(elapsed / 720) * 2.2 + Math.sin(elapsed / 1130) * 1.1;
          const neckBob = Math.sin(elapsed / 520) * 0.5;
          const yaw = lookScale * 22; // degrees of head turn
          const lateral = lookScale * 2.5; // px of head sway
          const tx = cx - SPRITE_W / 2;
          const ty = topY - SPRITE_H + sink;
          // Wrap: position only — no flipping, no rotation. Body stays put.
          wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          // Head: rotate + slight translate, pivoting at the neck base.
          imgHead.style.transform = `translate(${lateral}px, ${neckBob}px) rotate(${yaw + wiggle}deg)`;
          positionBubble(cx, topY);
          if (elapsed >= takeoffAt) takeoff();
          raf = requestAnimationFrame(tick);
          return;
        }
      }

      if (mode === "startle") {
        const shake = Math.sin(elapsed / 35) * 2;
        const baseX = x - SPRITE_W / 2 + shake;
        const baseY = y - SPRITE_H / 2;
        wrap.style.transform = `translate3d(${baseX}px, ${baseY}px, 0)`;
        imgHead.style.transform = `scaleX(${lookScale})`;
        positionBubble(x, y);
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
          perchKind = p.kind;
          perchOffset = p.offset;
          mode = "approach";
          targetSpeed = 110; // normal cruise — do NOT sprint to the perch
        } else {
          nextPerchAt = elapsed + rand(4000, 9000);
        }
      }

      if (mode === "approach") {
        if (!perchAlive()) {
          mode = "fly";
          nextPerchAt = elapsed + nextPerchDelay();
        } else {
          const { cx, topY, sink } = perchTarget();
          const tx = cx;
          const ty = topY - SPRITE_H + sink + SPRITE_H / 2;
          targetHeading = Math.atan2(ty - y, tx - x);
          if (Math.hypot(tx - x, ty - y) < 8) {
            x = tx;
            y = ty;
            mode = "land";
            setLanded();
            raf = requestAnimationFrame(tick);
            return;
          }
        }
      }

      // === Normal flying (also used during approach) ===
      if (mode === "fly") {
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
      }

      let dh = ((targetHeading - heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dh < -Math.PI) dh += Math.PI * 2;
      const turnRate = (reducedMotion ? 0.6 : mode === "approach" ? 2.2 : 1.4) * dt;
      heading += Math.max(-turnRate, Math.min(turnRate, dh));

      speed += (targetSpeed - speed) * Math.min(1, dt * 1.2);

      const bob = Math.sin(elapsed / 380) * 14 * dt;
      const vx = Math.cos(heading) * speed;
      const vy = Math.sin(heading) * speed + bob * 4;
      x += vx * dt;
      y += vy * dt;
      x = Math.max(-SPRITE_W, Math.min(w + SPRITE_W, x));
      y = Math.max(-SPRITE_H, Math.min(h + SPRITE_H, y));

      // Smoother, more even flap cycle. Slight speed influence kept tiny so
      // the loop reads as a steady, natural wingbeat rather than a jitter.
      const flapHz = reducedMotion ? 3 : 5.5 + speed / 240;
      frameAccum += dtMs;
      const frameDur = 1000 / flapHz;
      if (frameAccum >= frameDur) {
        frameIdx = (frameIdx + 1) % 4;
        frameAccum -= frameDur; // preserve leftover for even cadence
        img.src = frames[frameIdx];
      }

      const facingLeft = Math.cos(heading) < 0;
      let pitch = Math.atan2(vy, Math.abs(vx)) * (180 / Math.PI);
      pitch = Math.max(-22, Math.min(22, pitch));
      // Subtle head bob + beak tilt synced to the flap cycle.
      const flapPhase = (frameAccum / frameDur + frameIdx) * (Math.PI / 2);
      const headBob = Math.sin(flapPhase) * 1.2; // px
      const beakTilt = Math.cos(flapPhase) * 2.5; // deg
      const visualRot = (facingLeft ? -pitch : pitch) + beakTilt;
      const scaleX = facingLeft ? -1 : 1;

      wrap.style.transform = `translate3d(${x - SPRITE_W / 2}px, ${y - SPRITE_H / 2 + headBob}px, 0) rotate(${visualRot}deg) scaleX(${scaleX})`;
      positionBubble(x, y);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [variant]);

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
          style={{
            imageRendering: "pixelated",
            display: "block",
            position: "absolute",
            inset: 0,
            transition: "opacity 260ms ease-out",
          }}
        />
        <img
          ref={imgStandBodyRef}
          alt=""
          width={SPRITE_W}
          height={SPRITE_H}
          style={{
            imageRendering: "pixelated",
            display: "block",
            position: "absolute",
            inset: 0,
            opacity: 0,
            transition: "opacity 260ms ease-out",
          }}
        />
        <img
          ref={imgStandHeadRef}
          alt=""
          width={SPRITE_W}
          height={SPRITE_H}
          style={{
            imageRendering: "pixelated",
            display: "block",
            position: "absolute",
            inset: 0,
            opacity: 0,
            // Pivot at the neck base where it meets the body (col 11.5,
            // row 10) so the entire head+neck swings as one piece and the
            // body stays still with no white pixels exposed behind it.
            transformOrigin: `${11.5 * PIXEL}px ${10 * PIXEL}px`,


            transition: "opacity 260ms ease-out",
          }}
        />


      </div>
      {/* Reaction bubble: WHATTA!! / smileys / pixel heart */}
      <div
        ref={bubbleRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "scale(0.7)",
          transformOrigin: "left bottom",
          opacity: 0,
          transition:
            "opacity 120ms ease-out, transform 160ms cubic-bezier(0.34,1.56,0.64,1)",
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 20,
        }}
      />
    </div>
  );
};

export default FlyingGoose;
