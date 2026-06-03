import { useEffect, useRef } from "react";
import { SMILEYS } from "@/lib/smileys";
import { boingBall, kickBoingBall } from "@/lib/boingBallState";
import type { OnelinerEntry } from "@/lib/nectarine";


const FRAMES: string[][] = [
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
];

const WHITE_COLORS: Record<string, string> = {
  K: "#1a1a1a",
  W: "#ffffff",
  L: "#e8eaee",
  G: "#b8bcc2",
  O: "#ff8a1f",
  D: "#c95a00",
  E: "#1a1a1a",
};

const BROWN_COLORS: Record<string, string> = {
  K: "#1a1a1a",
  W: "#b37a4c",
  L: "#d39a68",
  G: "#8f5f3b",
  O: "#f29a2f",
  D: "#b76a1f",
  E: "#1a1a1a",
};

const PIXEL = 3;
const FRAME_W = 24;
const FRAME_H = 18;
const SPRITE_W = FRAME_W * PIXEL;
const SPRITE_H = FRAME_H * PIXEL;
const BROWN_GOOSE_JOIN_DELAY_MS = 30000;
const BROWN_FLY_AWAY_MIN_MS = 120000;
const BROWN_FLY_AWAY_MAX_MS = 240000;
const BALL_START_VX_MIN = 100;
const BALL_START_VX_MAX = 180;
const BALL_START_VY_MIN = 70;
const BALL_START_VY_MAX = 150;
const BALL_KICK_MIN = 180;
const BALL_KICK_MAX = 270;

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

function randomSmileyUrl() {
  if (SMILEY_KEYS.length === 0) return null;
  const key = SMILEY_KEYS[Math.floor(Math.random() * SMILEY_KEYS.length)];
  return SMILEYS[key] ?? null;
}

function buildFrameSvgs(palette: Record<string, string>) {
  return FRAMES.map((rows) => {
    const rects: string[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        const color = palette[c];
        if (!color) continue;
        rects.push(
          `<rect x="${x * PIXEL}" y="${y * PIXEL}" width="${PIXEL}" height="${PIXEL}" fill="${color}"/>`,
        );
      }
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_W}" height="${SPRITE_H}" viewBox="0 0 ${SPRITE_W} ${SPRITE_H}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  });
}

type Goose = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  targetX: number;
  targetY: number;
  frame: number;
  frameAccum: number;
  isAway: boolean;
  awayUntil: number;
};

type Props = {
  oneliners?: OnelinerEntry[];
  onBallModeChange?: (active: boolean) => void;
};

const CHAT_LINES: [string, string][] = [
  ["Hi!", "Hi!"],
  ["Have you seen Rapture?", "Still looking!"],
  ["I'm hungry!", "Let's find snacks!"],
];

const LONELY_LINES = [
  "Where's my pal?",
  "Have you seen my goose friend around here?",
  "I'm so lonely! ��",
];

const FlyingGoose = ({ oneliners = [], onBallModeChange }: Props) => {
  const wrapsRef = useRef<Array<HTMLDivElement | null>>([]);
  const imgsRef = useRef<Array<HTMLImageElement | null>>([]);
  const bubblesRef = useRef<Array<HTMLDivElement | null>>([]);
  const lastOnelinerKeyRef = useRef<string | null>(null);
  const onBallModeChangeRef = useRef(onBallModeChange);
  useEffect(() => {
    onBallModeChangeRef.current = onBallModeChange;
  }, [onBallModeChange]);

  useEffect(() => {

    const whiteFrames = buildFrameSvgs(WHITE_COLORS);
    const brownFrames = buildFrameSvgs(BROWN_COLORS);
    const frameSets = [whiteFrames, brownFrames];

    let w = window.innerWidth;
    let h = window.innerHeight;
    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const geese: Goose[] = [
      {
        active: true,
        x: w * 0.35,
        y: h * 0.42,
        vx: 80,
        vy: 15,
        speed: 105,
        targetX: w * 0.7,
        targetY: h * 0.35,
        frame: 0,
        frameAccum: 0,
        isAway: false,
        awayUntil: 0,
      },
      {
        active: false,
        x: -SPRITE_W,
        y: h * 0.5,
        vx: 95,
        vy: -10,
        speed: 110,
        targetX: w * 0.2,
        targetY: h * 0.4,
        frame: 0,
        frameAccum: 0,
        isAway: false,
        awayUntil: 0,
      },
    ];

    const ball = {
      active: false,
      until: 0,
      catcherIndex: 0 as 0 | 1,
      cooldownUntil: 0,
    };

    const startAt = performance.now();
    const brownJoinAt = startAt + BROWN_GOOSE_JOIN_DELAY_MS;
    let nextChatAt = startAt + 12000;
    let nextTargetShiftAt = startAt + 2000;
    let nextBallModeAt = startAt + 35000;
    let nextFlyAwayAt = startAt + 55000;
    let nextLonelyAt = 0;

    let raf = 0;
    let last = startAt;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const showBubble = (index: number, html: string, durationMs: number) => {
      const bubble = bubblesRef.current[index];
      if (!bubble) return;
      bubble.innerHTML = html;
      bubble.style.opacity = "1";
      bubble.style.transform = "scale(1)";
      const hideAt = performance.now() + durationMs;
      bubble.dataset.hideAt = String(hideAt);
    };

    const maybeHideBubble = (index: number, now: number) => {
      const bubble = bubblesRef.current[index];
      if (!bubble) return;
      const hideAt = Number(bubble.dataset.hideAt || "0");
      if (hideAt && now >= hideAt) {
        bubble.style.opacity = "0";
        bubble.style.transform = "scale(0.75)";
        bubble.dataset.hideAt = "0";
      }
    };

    const startBallMode = (now: number) => {
      ball.active = true;
      ball.until = now + rand(45000, 120000);
      ball.catcherIndex = Math.random() < 0.5 ? 0 : 1;
      ball.cooldownUntil = now + 600;
      onBallModeChangeRef.current?.(true);
      showBubble(0, "Kickoff! ⚽", 1600);
      showBubble(1, "Pass!", 1600);
    };

    const stopBallMode = (now: number) => {
      ball.active = false;
      nextBallModeAt = now + rand(90000, 200000);
      onBallModeChangeRef.current?.(false);
    };


    const tick = (now: number) => {
      const dtMs = Math.min(64, now - last);
      const dt = dtMs / 1000;
      last = now;

      if (!geese[1].active && now >= brownJoinAt && geese[0].active) {
        geese[1].active = true;
        geese[1].x = Math.min(w - SPRITE_W, geese[0].x + 120);
        geese[1].y = Math.min(h - SPRITE_H, geese[0].y + 60);
        showBubble(0, "Hi!", 1700);
        showBubble(1, "Hi!", 1700);
      }

      if (geese[1].active && !geese[1].isAway && now >= nextFlyAwayAt && !ball.active) {
        geese[1].isAway = true;
        geese[1].awayUntil = now + rand(BROWN_FLY_AWAY_MIN_MS, BROWN_FLY_AWAY_MAX_MS);
        geese[1].targetX = w + SPRITE_W * 2;
        geese[1].targetY = rand(80, Math.max(100, h - 120));
        showBubble(1, "BRB!", 1400);
        nextLonelyAt = now + rand(3500, 9000);
        nextFlyAwayAt = now + rand(260000, 420000);
      }

      if (geese[1].isAway && now >= geese[1].awayUntil) {
        geese[1].isAway = false;
        geese[1].x = -SPRITE_W;
        geese[1].y = rand(100, Math.max(120, h - 150));
        geese[1].targetX = w * 0.55;
        geese[1].targetY = h * 0.4;
        showBubble(1, "I'm back!", 1700);
        showBubble(0, "Yay!", 1500);
      }

      if (geese[1].active && geese[1].isAway && now >= nextLonelyAt) {
        const line = LONELY_LINES[Math.floor(Math.random() * LONELY_LINES.length)];
        showBubble(0, line, 2500);
        nextLonelyAt = now + rand(18000, 32000);
      }

      if (geese[0].active && geese[1].active && !geese[1].isAway && !ball.active && now >= nextBallModeAt) {
        startBallMode(now);
      }
      if (ball.active && now >= ball.until) stopBallMode(now);

      if (geese[0].active && geese[1].active && !geese[1].isAway && !ball.active && now >= nextChatAt) {
        const pair = CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)];
        showBubble(0, pair[0], 1900);
        showBubble(1, pair[1], 1900);
        nextChatAt = now + rand(12000, 28000);
      }

      if (now >= nextTargetShiftAt) {
        nextTargetShiftAt = now + rand(1800, 4500);
        geese.forEach((g, idx) => {
          if (!g.active || g.isAway) return;
          if (!ball.active) {
            g.targetX = rand(80, Math.max(120, w - 80));
            g.targetY = rand(80, Math.max(120, h - 120));
          }
          if (idx === 0 && geese[1].active && !geese[1].isAway && Math.random() < 0.22) {
            const pair = CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)];
            showBubble(0, pair[0], 1600);
            showBubble(1, pair[1], 1600);
          }
        });
      }

      if (ball.active) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < 10) {
          ball.x = 10;
          ball.vx = Math.abs(ball.vx);
        } else if (ball.x > w - 10) {
          ball.x = w - 10;
          ball.vx = -Math.abs(ball.vx);
        }
        if (ball.y < 10) {
          ball.y = 10;
          ball.vy = Math.abs(ball.vy);
        } else if (ball.y > h - 10) {
          ball.y = h - 10;
          ball.vy = -Math.abs(ball.vy);
        }
      }

      geese.forEach((g, index) => {
        if (!g.active) return;

        if (g.isAway && g.x > w + SPRITE_W * 2) return;

        if (ball.active && (!g.isAway || index === 0)) {
          g.targetX = ball.x + (index === 0 ? -35 : 35);
          g.targetY = ball.y + (index === 0 ? -18 : 18);
        }

        const dx = g.targetX - g.x;
        const dy = g.targetY - g.y;
        const dist = Math.hypot(dx, dy) || 1;
        const desiredSpeed = ball.active ? 155 : g.speed;
        g.vx += ((dx / dist) * desiredSpeed - g.vx) * Math.min(1, dt * 2.3);
        g.vy += ((dy / dist) * desiredSpeed - g.vy) * Math.min(1, dt * 2.3);

        g.x += g.vx * dt;
        g.y += g.vy * dt;

        if (!g.isAway) {
          if (g.x < -20) {
            g.x = -20;
            g.vx = Math.abs(g.vx);
          } else if (g.x > w - SPRITE_W + 20) {
            g.x = w - SPRITE_W + 20;
            g.vx = -Math.abs(g.vx);
          }
          if (g.y < 40) {
            g.y = 40;
            g.vy = Math.abs(g.vy);
          } else if (g.y > h - SPRITE_H - 20) {
            g.y = h - SPRITE_H - 20;
            g.vy = -Math.abs(g.vy);
          }
        }

        if (ball.active) {
          const dBall = Math.hypot(g.x + SPRITE_W / 2 - ball.x, g.y + SPRITE_H / 2 - ball.y);
          if (dBall < 55) {
            const mate = geese[index === 0 ? 1 : 0];
            const tx = mate.active && !mate.isAway ? mate.x + SPRITE_W / 2 : (index === 0 ? w * 0.75 : w * 0.25);
            const ty = mate.active && !mate.isAway ? mate.y + SPRITE_H / 2 : h * 0.5;
            const pdx = tx - ball.x;
            const pdy = ty - ball.y;
            const plen = Math.hypot(pdx, pdy) || 1;
            const kick = rand(BALL_KICK_MIN, BALL_KICK_MAX);
            ball.vx = (pdx / plen) * kick + rand(-20, 20);
            ball.vy = (pdy / plen) * kick + rand(-20, 20);
          }
        }

        g.frameAccum += dtMs;
        const frameDur = ball.active ? 95 : 125;
        if (g.frameAccum >= frameDur) {
          g.frameAccum -= frameDur;
          g.frame = (g.frame + 1) % 4;
          const img = imgsRef.current[index];
          if (img) img.src = frameSets[index][g.frame];
        }

        const wrap = wrapsRef.current[index];
        if (wrap) {
          const facingLeft = g.vx < 0;
          const visible = !g.isAway || g.x <= w + SPRITE_W * 2;
          wrap.style.opacity = visible ? "1" : "0";
          wrap.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) scaleX(${facingLeft ? -1 : 1})`;
        }

        const bubble = bubblesRef.current[index];
        if (bubble) {
          bubble.style.left = `${g.x + SPRITE_W * 0.5}px`;
          bubble.style.top = `${g.y - 6}px`;
        }

        maybeHideBubble(index, now);
      });

      const ballEl = ballRef.current;
      if (ballEl) {
        ballEl.style.opacity = ball.active ? "1" : "0";
        ballEl.style.transform = `translate3d(${ball.x - 10}px, ${ball.y - 10}px, 0)`;
      }

      raf = requestAnimationFrame(tick);
    };

    const initialSet = () => {
      imgsRef.current.forEach((img, i) => {
        if (img) img.src = frameSets[i][0];
      });
    };
    initialSet();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!oneliners.length) return;
    const top = oneliners[0];
    const key = `${top.time}|${top.username}|${top.text}`;
    if (lastOnelinerKeyRef.current === null) {
      lastOnelinerKeyRef.current = key;
      return;
    }
    if (key === lastOnelinerKeyRef.current) return;
    lastOnelinerKeyRef.current = key;

    const text = top.text || "";
    const smileyUrl = firstSmileyUrl(text);
    if (!smileyUrl) return;

    const randomAlt = Math.random() < 0.25 ? randomSmileyUrl() : null;
    const urls = [smileyUrl, randomAlt || smileyUrl];

    urls.forEach((url, index) => {
      const bubble = bubblesRef.current[index];
      if (!bubble || !url) return;
      bubble.innerHTML = `<img src="${url}" alt="" style="display:block;height:28px;width:auto" />`;
      bubble.style.opacity = "1";
      bubble.style.transform = "scale(1)";
      bubble.dataset.hideAt = String(performance.now() + 2600);
    });
  }, [oneliners]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 60 }} aria-hidden>
      {[0, 1].map((i) => (
        <div key={`goose-${i}`}>
          <div
            ref={(el) => {
              wrapsRef.current[i] = el;
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: SPRITE_W,
              height: SPRITE_H,
              willChange: "transform",
              transformOrigin: "center center",
              filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.25))",
              opacity: i === 0 ? 1 : 0,
            }}
          >
            <img
              ref={(el) => {
                imgsRef.current[i] = el;
              }}
              alt=""
              width={SPRITE_W}
              height={SPRITE_H}
              style={{ imageRendering: "pixelated", display: "block", position: "absolute", inset: 0 }}
            />
          </div>
          <div
            ref={(el) => {
              bubblesRef.current[i] = el;
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: "scale(0.75)",
              transformOrigin: "left bottom",
              opacity: 0,
              transition: "opacity 120ms ease-out, transform 180ms cubic-bezier(0.34,1.56,0.64,1)",
              padding: "4px 10px",
              background: "#fff",
              color: "#1a1a1a",
              fontWeight: 900,
              fontFamily: "system-ui, sans-serif",
              fontSize: 13,
              letterSpacing: "0.03em",
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
      ))}

      <div
        ref={ballRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: "2px solid #1a1a1a",
          background:
            "radial-gradient(circle at 30% 30%, #fff 0%, #fff 18%, #e11d48 19%, #e11d48 46%, #fff 47%, #fff 70%, #111 71%, #111 100%)",
          boxShadow: "0 0 10px rgba(255,255,255,0.4)",
          opacity: 0,
          transition: "opacity 180ms ease-out",
          zIndex: 61,
        }}
      />
    </div>
  );
};

export default FlyingGoose;
