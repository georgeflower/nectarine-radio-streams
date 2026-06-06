import { useEffect, useRef } from "react";
import { SMILEYS } from "@/lib/smileys";
import {
  noteRecentOneliner,
  registerGoose,
  reactToOnelinerSmiley,
  type GooseAPI,
} from "@/lib/gooseSocial";
import { getEatingLayoutForGoose, getSceneScale } from "@/lib/gooseScene";
import {
  gooseIsRecovered,
  gooseIsTired,
  pickPerchCandidate,
  type PerchCandidate,
  type PerchKind,
  STAMINA_MAX,
  updateGooseStamina,
  type GooseMode,
} from "@/lib/gooseBehavior";
import type { OnelinerEntry } from "@/lib/nectarine";
import { detectOnelinerReaction } from "@/lib/onelinerReactions";
import { detectGooseTriggerReaction } from "@/lib/gooseTriggerReactions";
import { learnPhraseFromOneliner } from "@/lib/gooseLearnedPhrases";
import {
  BASE_SPRITE_H,
  BASE_SPRITE_W,
  buildGooseFrameDataUrls,
  type GooseVariant,
  NECK_PIVOT_X_PX,
  NECK_PIVOT_Y_PX,
  PIXEL,
  STAND_BODY,
  STAND_HEAD,
} from "@/lib/gooseSprite";
const BEAK_OFFSET_X_RATIO = 0.34;
const BEAK_OFFSET_Y_RATIO = -0.12;
const LETTER_PERCH_SINK = 10;
const WINDOW_PERCH_SINK = 2;

const eatingGooseIds = new Set<number>();
let nextGooseInstanceId = 1;

// --- Smiley detection ----------------------------------------------------
// Build lookup once; sorted longest-first so e.g. ":facepalm2:" beats ":facepalm:".
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const SMILEY_KEYS = Object.keys(SMILEYS).sort((a, b) => b.length - a.length);
const SMILEY_RE = new RegExp(SMILEY_KEYS.map(escapeRegex).join("|"), "i");
const SMILEY_RE_G = new RegExp(SMILEY_KEYS.map(escapeRegex).join("|"), "gi");
const SMILEY_LC: Record<string, string> = {};
for (const k of SMILEY_KEYS) SMILEY_LC[k.toLowerCase()] = k;
const REACTION_SMILEY: Record<"heart" | "laughter" | "wink", string> = {
  heart: SMILEYS["<3"],
  laughter: SMILEYS[":lol:"],
  wink: SMILEYS[";)"],
};

function firstSmileyUrl(text: string): string | null {
  const m = SMILEY_RE.exec(text);
  if (!m) return null;
  const canonical = SMILEY_LC[m[0].toLowerCase()];
  return canonical ? SMILEYS[canonical] : null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

// Render plain text with smiley codes converted to inline <img> tags so the
// goose can "speak" using the same emoticon vocabulary as the oneliner.
function renderGooseHTML(text: string): string {
  if (!text) return "";
  const pieces: string[] = [];
  let last = 0;
  SMILEY_RE_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SMILEY_RE_G.exec(text)) !== null) {
    if (m.index > last) pieces.push(escapeHtml(text.slice(last, m.index)));
    const canonical = SMILEY_LC[m[0].toLowerCase()];
    const url = canonical ? SMILEYS[canonical] : null;
    if (url) {
      pieces.push(
        `<img src="${url}" alt="" style="display:inline-block;height:18px;width:auto;vertical-align:middle;margin:0 2px" />`,
      );
    } else {
      pieces.push(escapeHtml(m[0]));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push(escapeHtml(text.slice(last)));
  return pieces.join("");
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

type Mode = GooseMode;
const CHEW_CYCLE_MS = 180;
const CHEW_AMPLITUDE = 1.2;
const CHEW_ROTATION_FACTOR = 2.4;
// Practical "indefinite" delay used to suppress random perching while busy.
const INDEFINITE_PERCH_DELAY_MS = 1_000_000_000;

type Props = {
  oneliners?: OnelinerEntry[];
  variant?: GooseVariant;
};

const FlyingGoose = ({ oneliners = [], variant = "white" }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgStandBodyRef = useRef<HTMLImageElement | null>(null);
  const imgStandHeadRef = useRef<HTMLImageElement | null>(null);
  const foodBagRef = useRef<HTMLDivElement | null>(null);

  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Imperative reaction state shared between effects.
  const reactionUntilRef = useRef<number>(0);
  const panicUntilRef = useRef<number>(0);
  const panicPhraseRef = useRef<string>("");
  const lastOnelinerKeyRef = useRef<string | null>(null);
  const gooseInstanceIdRef = useRef<number>(0);

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
    if (variant === "white") {
      learnPhraseFromOneliner(text, top.username);
      noteRecentOneliner(top.username, text);
    }
    const triggerReaction = detectGooseTriggerReaction(text);
    if (triggerReaction) {
      bubble.innerHTML = renderGooseHTML(triggerReaction.echo);
      bubble.style.opacity = "1";
      bubble.style.transform = "scale(1)";
      reactionUntilRef.current = performance.now() + 2800;
      panicUntilRef.current = performance.now() + 2600;
      panicPhraseRef.current = triggerReaction.echo;
      return;
    }
    const mentionsGoose = /\bgoose\b/i.test(text);
    const reaction = detectOnelinerReaction(text);
    const smileyUrl = firstSmileyUrl(text) || (reaction ? REACTION_SMILEY[reaction] : null);

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
    // Let the partner goose chime in with a cute response.
    reactToOnelinerSmiley(variant === "brown" || variant === "gosling-brown" ? "brown" : "white");
  }, [oneliners, variant]);

  useEffect(() => {
    const frames = buildGooseFrameDataUrls(variant);

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!gooseInstanceIdRef.current) gooseInstanceIdRef.current = nextGooseInstanceId++;

    const rootEl = wrapRef.current?.parentElement ?? null;
    const stageW = () => (rootEl ? rootEl.clientWidth : window.innerWidth);
    const stageH = () => (rootEl ? rootEl.clientHeight : window.innerHeight);
    let w = stageW();
    let h = stageH();
    let sceneScale = getSceneScale(w, h);
    const spriteW = () => BASE_SPRITE_W * sceneScale;
    const spriteH = () => BASE_SPRITE_H * sceneScale;
    const scale = (value: number) => value * sceneScale;
    const gooseId = gooseInstanceIdRef.current;
    const peckPhase = Math.random() * Math.PI * 2;
    const peckTempo = 0.85 + Math.random() * 0.3;
    const peckStrength = 0.85 + Math.random() * 0.35;

    const getEatingLayout = () =>
      getEatingLayoutForGoose(gooseId, [...eatingGooseIds], w, h, sceneScale);

    let carryingFoodBag = false;
    const onResize = () => {
      const prevW = Math.max(1, w);
      const prevH = Math.max(1, h);
      const prevScale = sceneScale;
      w = stageW();
      h = stageH();
      sceneScale = getSceneScale(w, h);
      const sx = w / prevW;
      const sy = h / prevH;
      const sv = sceneScale / Math.max(prevScale, 0.0001);
      const perched = mode === "land" || mode === "startle";
      const perchAlive =
        perchEl &&
        perchEl.isConnected &&
        (perchKind === "letter"
          ? (perchEl.getAttribute("data-goose-letter") || "") === perchChar &&
            perchEl.textContent === perchChar
          : perchEl.hasAttribute("data-goose-perch"));
      if (perched && perchAlive) {
        const r = perchEl.getBoundingClientRect();
        const cx = r.left + r.width * perchOffset;
        const sink = perchKind === "letter" ? LETTER_PERCH_SINK : WINDOW_PERCH_SINK;
        x = cx;
        y = r.top + sink - spriteH() / 2;
      } else {
        x *= sx;
        y *= sy;
      }
      speed *= sv;
      targetSpeed *= sv;
    };
    // Flight state
    let x = Math.random() * w;
    let y = h * (0.2 + Math.random() * 0.4);
    let heading = Math.random() * Math.PI * 2;
    let targetHeading = heading;
    let speed = scale(110);
    let targetSpeed = speed;
    let frameIdx = 0;
    let frameAccum = 0;
    let nextDriftAt = 0;
    let nextBankAt = 800 + Math.random() * 2200;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;

    let ro: ResizeObserver | null = null;
    if (rootEl) {
      ro = new ResizeObserver(onResize);
      ro.observe(rootEl);
    } else {
      window.addEventListener("resize", onResize);
    }

    // Random helpers for landing/perch cadence.
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const nextPerchDelay = () => rand(8000, 28000); // ms between landings
    const sitDuration = () => rand(5000, 22000); // ms sat on a letter
    const tiredRestDuration = () => rand(6500, 12000); // ms of still rest when exhausted (randomized)
    const tiredRecoveryTakeoffDelay = () => rand(2200, 4600); // ms after recovery before taking off

    // Perch state
    let mode: Mode = "fly";
    let perchEl: HTMLElement | null = null;
    let perchChar = "";
    let perchKind: PerchKind = "letter";
    let perchOffset = 0.5; // horizontal position along perch (0..1)
    let nextPerchAt = nextPerchDelay();
    let takeoffAt = 0;
    let nextLookAt = 0;
    let lookDir: 1 | -1 = 1;
    let lookScale = 1; // animated -1..1, smoothly tweens toward lookDir while standing
    let startleEnd = 0;

    // Away-mode (fly off-screen) state, driven by the social coordinator.
    let away = false;
    let awayHeading = 0;
    let chaseTarget: { x: number; y: number } | null = null;
    let sittingForMeal = false;
    let eatingMode = false; // when true, lands and pecks indefinitely
    let fetchingFood = false;
    let ballPlayActive = false;
    let stamina = STAMINA_MAX;
    let restingFromTiredness = false;
    let tiredRestReleaseAt = 0;
    let panicFlightUntil = 0;
    let lastAppliedPanicUntil = 0;


    const wrap = wrapRef.current;
    const img = imgRef.current;
    const imgBody = imgStandBodyRef.current;
    const imgHead = imgStandHeadRef.current;
    const foodBag = foodBagRef.current;
    const bubble = bubbleRef.current;
    if (!wrap || !img || !imgBody || !imgHead || !foodBag || !bubble) return;
    const applyScaledStyles = () => {
      wrap.style.width = `${spriteW()}px`;
      wrap.style.height = `${spriteH()}px`;
      imgHead.style.transformOrigin = `${NECK_PIVOT_X_PX * sceneScale}px ${NECK_PIVOT_Y_PX * sceneScale}px`;
      foodBag.style.fontSize = `${22 * sceneScale}px`;
    };
    onResize();
    applyScaledStyles();
    img.src = frames[0];
    imgBody.src = frames[STAND_BODY];
    imgHead.src = frames[STAND_HEAD];

    // Imperative API exposed to the social coordinator so the partner goose
    // (and the BoingBall) can trigger speech bubbles and fly-away behavior.
    const api: GooseAPI = {
      variant: variant === "brown" || variant === "gosling-brown" ? "brown" : "white",
      say: (text: string, durationMs = 2400) => {
        bubble.innerHTML = renderGooseHTML(text);
        bubble.style.opacity = "1";
        bubble.style.transform = "scale(1)";
        reactionUntilRef.current = performance.now() + durationMs;
      },
      getPosition: () => ({ x, y }),
      setAway: (a: boolean) => {
        away = a;
        if (a) {
          // Head toward the nearest horizontal edge.
          awayHeading = x < w / 2 ? Math.PI : 0;
          // Force takeoff if currently perched.
          if (mode === "land") {
            // Skip the startle; just leap off.
            mode = "fly";
            perchEl = null;
            heading = awayHeading;
            targetHeading = awayHeading;
            img.style.opacity = "1";
            imgBody.style.opacity = "0";
            imgHead.style.opacity = "0";
          }
        }
      },
      setChaseTarget: (target: { x: number; y: number } | null) => {
        chaseTarget = target;
        if (target) {
          // Ball-play overrides sitting: clear any lingering meal/sitting state.
          if (sittingForMeal) {
            sittingForMeal = false;
            eatingGooseIds.delete(gooseId);
            eatingMode = false;
          }
          if (!away && !fetchingFood) {
            mode = "fly";
            perchEl = null;
            img.style.opacity = "1";
            imgBody.style.opacity = "0";
            imgHead.style.opacity = "0";
          }
        }
      },
      setFoodBag: (carrying: boolean) => {
        carryingFoodBag = carrying;
      },
      setSitting: (sitting: boolean) => {
        sittingForMeal = sitting;
        if (sitting) {
          eatingGooseIds.add(gooseId);
          eatingMode = true;
          chaseTarget = null;
          restingFromTiredness = false;
          const p = pickPerch({ x, y });
          if (p) {
            perchEl = p.el;
            perchChar = p.char;
            perchKind = p.kind;
            perchOffset = p.offset;
            mode = "approach";
            targetSpeed = scale(115);
            img.style.opacity = "1";
            imgBody.style.opacity = "0";
            imgHead.style.opacity = "0";
          } else {
            mode = "fly";
            perchEl = null;
            nextPerchAt = elapsed;
          }
        } else {
          eatingGooseIds.delete(gooseId);
          eatingMode = false;
          if (mode === "ground" || mode === "land" || mode === "approach") takeoff();
        }

      },
      setFetchingFood: (fetching: boolean) => {
        fetchingFood = fetching;
        if (!fetching) {
          nextPerchAt = Math.min(nextPerchAt, elapsed + rand(2500, 6500));
          return;
        }
        chaseTarget = null;
        if (mode === "ground" || mode === "land" || mode === "approach" || mode === "startle") {
          mode = "fly";
          perchEl = null;
          heading = away ? awayHeading : heading;
          targetHeading = away ? awayHeading : targetHeading;
          img.style.opacity = "1";
          imgBody.style.opacity = "0";
          imgHead.style.opacity = "0";
        }
        nextPerchAt = elapsed + INDEFINITE_PERCH_DELAY_MS;
      },
      setBallPlayActive: (active: boolean) => {
        ballPlayActive = active;
        if (active) {
          sittingForMeal = false;
          eatingGooseIds.delete(gooseId);
          eatingMode = false;
          restingFromTiredness = false;
          if (mode === "ground" || mode === "land" || mode === "approach") takeoff();
        }
      },
    };
    const unregisterGoose = registerGoose(api);



    const pickPerch = (from: { x: number; y: number } | null = null):
      | { el: HTMLElement; char: string; kind: "letter" | "window"; offset: number }
      | null => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-goose-letter], [data-goose-perch]",
        ),
      )
        .map((el): PerchCandidate<HTMLElement> | null => {
          const r = el.getBoundingClientRect();
          if (!(r.width > 6 && r.height > 6 && r.top > 40 && r.bottom < h - 20)) return null;
          const isLetter = el.hasAttribute("data-goose-letter");
          return {
            ref: el,
            char: isLetter ? el.getAttribute("data-goose-letter") || "" : "",
            kind: isLetter ? "letter" : "window",
            left: r.left,
            top: r.top,
            width: r.width,
          };
        })
        .filter((candidate): candidate is PerchCandidate<HTMLElement> => candidate !== null);

      const selected = pickPerchCandidate(candidates, from);
      if (!selected) return null;
      return {
        el: selected.ref,
        char: selected.char,
        kind: selected.kind,
        offset: selected.offset,
      };
    };

    // Returns the visual landing point (center x, top y of the perch surface)
    // and how much the sprite should sink onto the surface.
    const perchTarget = (): { cx: number; topY: number; sink: number } => {
      const r = perchEl!.getBoundingClientRect();
      const cx = r.left + r.width * perchOffset;
      if (perchKind === "letter") {
        // Letter rect top sits above the visible cap because of line-height.
        return { cx, topY: r.top, sink: LETTER_PERCH_SINK };
      }
      // Window title bar — feet rest right on the top edge.
      return { cx, topY: r.top, sink: WINDOW_PERCH_SINK };
    };

    const showStartleBubble = (text = "WHATTA!!") => {
      bubble.innerHTML = renderGooseHTML(text);
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
      takeoffAt = eatingMode || restingFromTiredness ? Number.POSITIVE_INFINITY : elapsed + sitDuration();
      tiredRestReleaseAt = restingFromTiredness ? elapsed + tiredRestDuration() : 0;
      nextLookAt = elapsed + rand(700, 1600);
      x = cx;
      y = topY + sink - spriteH() / 2;
    };


    const startle = (bubbleText = "WHATTA!!", durationMs = 1400) => {
      mode = "startle";
      startleEnd = elapsed + durationMs;
      imgBody.style.opacity = "1";
      imgHead.style.opacity = "1";
      img.style.opacity = "0";
      showStartleBubble(bubbleText);
    };

    const takeoff = () => {
      mode = "fly";
      restingFromTiredness = false;
      tiredRestReleaseAt = 0;
      perchEl = null;
      heading = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      targetHeading = heading;
      speed = scale(180);
      targetSpeed = scale(130);
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
      stamina = updateGooseStamina(stamina, mode, dt);
      applyScaledStyles();

      hideBubbleIfExpired(now);
      if (panicUntilRef.current > lastAppliedPanicUntil) {
        lastAppliedPanicUntil = panicUntilRef.current;
        panicFlightUntil = elapsed + 2400;
        startle(panicPhraseRef.current || "WHATTA!", 1000);
      }

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
      // Clamp horizontally + vertically so it never escapes the stage.
      const positionBubble = (cx: number, cy: number) => {
        if (!reactionUntilRef.current) return;
        const bw = bubble.offsetWidth || 80;
        const bh = bubble.offsetHeight || 24;
        const PAD = 6;
        let left = cx;
        // The bubble uses translate("8px -100%") + transformOrigin "left bottom".
        // After translate the bubble's left edge sits at (left + 8 - bw); clamp left
        // so that left edge >= PAD and right edge (left + 8) <= w - PAD.
        if (left + 8 - bw < PAD) left = PAD + bw - 8;
        if (left + 8 > w - PAD) left = w - PAD - 8;
        let top = cy - spriteH() / 2 - scale(6);
        // top is the bubble's bottom anchor (translate -100%). Bubble top = top - bh.
        if (top - bh < PAD) top = cy + spriteH() / 2 + scale(6) + bh; // flip below
        bubble.style.left = `${left}px`;
        bubble.style.top = `${top}px`;
      };

      const positionFoodBag = () => {
        foodBag.style.opacity = eatingMode || carryingFoodBag ? "1" : "0";
        if (eatingMode && mode === "land" && perchEl) {
          const { cx, topY } = perchTarget();
          foodBag.style.left = `${cx}px`;
          foodBag.style.top = `${topY - scale(6)}px`;
          foodBag.style.transform = "translate(-50%, -100%) rotate(0deg)";
          return;
        }
        if (carryingFoodBag || (eatingMode && mode !== "land")) {
          const beakOffsetX = spriteW() * BEAK_OFFSET_X_RATIO;
          const beakOffsetY = spriteH() * BEAK_OFFSET_Y_RATIO;
          const facingLeft = Math.cos(heading) < 0;
          foodBag.style.left = `${x + (facingLeft ? -beakOffsetX : beakOffsetX)}px`;
          foodBag.style.top = `${y + beakOffsetY}px`;
          foodBag.style.transform = `translate(-50%, -50%) rotate(${facingLeft ? -8 : 8}deg)`;
        }
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
          const tx = cx - spriteW() / 2;
          const ty = topY - spriteH() + sink;
          // Wrap: position only — no flipping, no rotation. Body stays put.
          wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          if (eatingMode) {
            // Pecking at the food: rhythmic chew/peck instead of idle look.
            const chew =
              Math.sin(elapsed / (CHEW_CYCLE_MS * peckTempo) + peckPhase) *
              CHEW_AMPLITUDE *
              peckStrength *
              sceneScale;
            imgHead.style.transform = `translate(0px, ${chew}px) rotate(${chew * CHEW_ROTATION_FACTOR}deg)`;
          } else if (restingFromTiredness) {
            // Sleep head tilt: head tucked down and slowly bobbing — ported
            // from the sim's SLEEP_HEAD_* animation.
            const breath = Math.sin(elapsed / 1400) * 1.5;
            const sway = Math.sin(elapsed / 1800) * 4;
            const tuckRotate = -22 + sway; // head pulled down toward the body
            const tuckDrop = 4 + breath;
            imgHead.style.transform = `translate(0px, ${tuckDrop * sceneScale}px) rotate(${tuckRotate}deg)`;
          } else {
            // Head: rotate + slight translate, pivoting at the neck base.
            imgHead.style.transform = `translate(${lateral}px, ${neckBob}px) rotate(${yaw + wiggle}deg)`;
          }

          positionBubble(cx, topY);
          positionFoodBag();
          if (restingFromTiredness && gooseIsRecovered(stamina) && elapsed >= tiredRestReleaseAt) {
            restingFromTiredness = false;
            tiredRestReleaseAt = 0;
            takeoffAt = Math.min(takeoffAt, elapsed + tiredRecoveryTakeoffDelay());
          }
          if (elapsed >= takeoffAt) takeoff();
          raf = requestAnimationFrame(tick);
          return;
        }
      }

      if (mode === "startle") {
        const shake = Math.sin(elapsed / 35) * 2;
        const baseX = x - spriteW() / 2 + shake;
        const baseY = y - spriteH() / 2;
        wrap.style.transform = `translate3d(${baseX}px, ${baseY}px, 0)`;
        imgHead.style.transform = `scaleX(${lookScale})`;
        positionBubble(x, y);
        positionFoodBag();
        if (elapsed >= startleEnd) takeoff();
        raf = requestAnimationFrame(tick);
        return;
      }

      if (mode === "ground") {
        if (eatingMode) {
          const layout = getEatingLayout();
          x += (layout.x - x) * Math.min(1, dt * 6);
          y += (layout.y - y) * Math.min(1, dt * 6);
          heading = layout.heading;
          targetHeading = heading;
        }
        const tx = x - spriteW() / 2;
        const ty = y - spriteH() / 2;
        const chew =
          Math.sin(elapsed / (CHEW_CYCLE_MS * peckTempo) + peckPhase) *
          CHEW_AMPLITUDE *
          peckStrength *
          sceneScale;
        wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        imgHead.style.transform = `translate(0px, ${chew}px) rotate(${chew * CHEW_ROTATION_FACTOR}deg)`;
        positionBubble(x, y);
        positionFoodBag();
        raf = requestAnimationFrame(tick);
        return;
      }


      // ===== FLY / APPROACH =====
      if (!fetchingFood && !eatingMode && !ballPlayActive && (mode === "fly" || mode === "approach") && gooseIsTired(stamina)) {
        const nearestPerch = pickPerch({ x, y });
        if (nearestPerch) {
          perchEl = nearestPerch.el;
          perchChar = nearestPerch.char;
          perchKind = nearestPerch.kind;
          perchOffset = nearestPerch.offset;
          mode = "approach";
          restingFromTiredness = true;
          targetSpeed = scale(105);
        }
      }
      if (mode === "fly" && eatingMode && !away) {
        const mealPerch = pickPerch({ x, y });
        if (mealPerch) {
          perchEl = mealPerch.el;
          perchChar = mealPerch.char;
          perchKind = mealPerch.kind;
          perchOffset = mealPerch.offset;
          mode = "approach";
          targetSpeed = scale(115);
        }
      }
      if (mode === "fly" && !away && !eatingMode && !fetchingFood && !ballPlayActive && elapsed >= nextPerchAt) {
        const p = pickPerch();
        if (p) {
          perchEl = p.el;
          perchChar = p.char;
          perchKind = p.kind;
          perchOffset = p.offset;
          mode = "approach";
          targetSpeed = scale(110); // normal cruise — do NOT sprint to the perch
        } else {
          nextPerchAt = elapsed + rand(4000, 9000);
        }
      }
      if (mode === "approach") {
        if (!perchAlive() || (away && !restingFromTiredness && !eatingMode) || fetchingFood) {
          const replacement =
            (away && !restingFromTiredness && !eatingMode) || fetchingFood
              ? null
              : pickPerch({ x, y });
          if (replacement) {
            perchEl = replacement.el;
            perchChar = replacement.char;
            perchKind = replacement.kind;
            perchOffset = replacement.offset;
          } else {
            mode = "fly";
            nextPerchAt = elapsed + nextPerchDelay();
          }
        } else {
          const { cx, topY, sink } = perchTarget();
          const tx = cx;
          const ty = topY - spriteH() + sink + spriteH() / 2;
          targetHeading = Math.atan2(ty - y, tx - x);
          if (Math.hypot(tx - x, ty - y) < scale(8)) {
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
        if (away) {
          // Beeline off-screen and stay there until the coordinator brings
          // us back. Suppress drift, banking and the inward boundary nudge.
          targetHeading = awayHeading;
          targetSpeed = scale(180);
          nextPerchAt = elapsed + INDEFINITE_PERCH_DELAY_MS;
        } else if (chaseTarget) {
          targetHeading = Math.atan2(chaseTarget.y - y, chaseTarget.x - x);
          targetSpeed = scale(290);
          nextPerchAt = elapsed + INDEFINITE_PERCH_DELAY_MS;
        } else if (fetchingFood) {
          targetSpeed = scale(220);
          nextPerchAt = elapsed + INDEFINITE_PERCH_DELAY_MS;
          targetHeading += (Math.random() - 0.5) * 0.45;

        } else {
          if (elapsed >= nextDriftAt) {
            targetHeading += (Math.random() - 0.5) * 0.6;
            nextDriftAt = elapsed + 400 + Math.random() * 500;
          }
          if (panicFlightUntil > elapsed) {
            targetSpeed = Math.max(targetSpeed, scale(330));
            targetHeading += (Math.random() - 0.5) * 0.8;
          }
          if (elapsed >= nextBankAt) {
            const turn = (Math.PI / 180) * (60 + Math.random() * 80);
            targetHeading += (Math.random() < 0.5 ? -1 : 1) * turn;
            targetSpeed = scale(80 + Math.random() * 90);
            nextBankAt = elapsed + 3500 + Math.random() * 5000;
          }

          const margin = scale(80);
          if (x < margin || x > w - margin || y < margin || y > h - margin) {
            const cx = w / 2;
            const cy = h / 2;
            const inward = Math.atan2(cy - y, cx - x);
            targetHeading = inward + (Math.random() - 0.5) * 0.4;
          }
        }
      }

      let dh = ((targetHeading - heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dh < -Math.PI) dh += Math.PI * 2;
      const turnRate = (reducedMotion ? 0.6 : chaseTarget ? 3.2 : mode === "approach" ? 2.2 : 1.4) * dt;
      heading += Math.max(-turnRate, Math.min(turnRate, dh));

      speed += (targetSpeed - speed) * Math.min(1, dt * 1.2);

      const bob = Math.sin(elapsed / 380) * scale(14) * dt;
      const vx = Math.cos(heading) * speed;
      const vy = Math.sin(heading) * speed + bob * 4;
      x += vx * dt;
      y += vy * dt;
      x = Math.max(-spriteW(), Math.min(w + spriteW(), x));
      y = Math.max(-spriteH(), Math.min(h + spriteH(), y));

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

      wrap.style.transform = `translate3d(${x - spriteW() / 2}px, ${y - spriteH() / 2 + headBob}px, 0) rotate(${visualRot}deg) scaleX(${scaleX})`;
      positionBubble(x, y);
      positionFoodBag();

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", onResize);
      eatingGooseIds.delete(gooseId);
      unregisterGoose();
    };
  }, [variant]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 60 }}
      aria-hidden
    >
      <div
        ref={wrapRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: BASE_SPRITE_W,
          height: BASE_SPRITE_H,
          willChange: "transform",
          transformOrigin: "center center",
          filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.25))",
        }}
      >
        <img
          ref={imgRef}
          alt=""
          width={BASE_SPRITE_W}
          height={BASE_SPRITE_H}
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
          width={BASE_SPRITE_W}
          height={BASE_SPRITE_H}
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
          width={BASE_SPRITE_W}
          height={BASE_SPRITE_H}
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
      <div
        ref={foodBagRef}
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          fontSize: 22,
          lineHeight: 1,
          opacity: 0,
          transform: "translate(-50%, -50%) rotate(8deg)",
          transition: "opacity 180ms ease-out",
          filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))",
          pointerEvents: "none",
        }}
      >
        🛍️
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
