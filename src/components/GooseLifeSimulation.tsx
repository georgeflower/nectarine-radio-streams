import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { OnelinerEntry } from "@/lib/nectarine";
import {
  createInitialGooseLifeState,
  dayFromAgeHours,
  LIFESPAN_HOURS,
  loadGooseLifeState,
  maybeApplyLatestOneliner,
  saveGooseLifeState,
  stepGooseLife,
  type Goose,
  type GooseLifeState,
  type StageBounds,
} from "@/lib/gooseLife";
import {
  BASE_SPRITE_H,
  BASE_SPRITE_W,
  buildGooseFrameDataUrls,
  type GooseVariant,
  NECK_PIVOT_X_PX,
  NECK_PIVOT_Y_PX,
  STAND_BODY,
  STAND_HEAD,
} from "@/lib/gooseSprite";
import { GOOSE_DIALOGUES } from "@/lib/gooseDialogues";
import {
  noteRecentOneliner,
  registerGoose,
  type GooseAPI,
  type GooseRole,
} from "@/lib/gooseSocial";

type Props = {
  oneliners?: OnelinerEntry[];
};

type GooseSpeech = {
  text: string;
  until: number;
};

type GooseVisualMode = "fly" | "walk" | "run" | "perched";

const stateLabel: Record<Goose["state"], string> = {
  idle: "idle",
  waddle: "waddle",
  fly: "fly",
  eat: "eat",
  sleep: "sleep",
  play: "play",
  interact: "interact",
  mourn: "mourn",
  follow: "follow",
};

const CLASSIC_CHATTER_POOL: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pair of GOOSE_DIALOGUES) {
    for (const line of pair) {
      const clean = line.trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
})();

const GOSLING_CHATTER = [
  "peep peep!",
  "honkito!",
  "tiny flap!",
  "beep beep honk",
  "mama wait!",
  "crumb crumb!",
  "wobble wobble",
  "pip pip!",
  "boing chirp!",
  "goose baby zoom!",
];

const MAX_SPEECH_LENGTH = 42;
const DEFAULT_SPRITE_SCALE_FACTOR = 0.78;
const GOSLING_SCALE_FACTOR = 0.58;
// Gosling-only ambient speech (adult chatter handled by gooseSocial turn-taking system)
const GOSLING_AMBIENT_SPEECH_INTERVAL_MS = 9500;
const MIN_AMBIENT_SPEECH_DURATION_MS = 1800;
const AMBIENT_SPEECH_DURATION_VARIANCE_MS = 1400;
const GOSLING_AMBIENT_SPEECH_PROBABILITY = 0.28;
const ONELINER_SPEECH_DURATION_MS = 2800;
const PERCH_UPDATE_INTERVAL_MS = 2600;
const PHASE_OFFSET_MULTIPLIER_MS = 2000;
const FLY_FRAME_DURATION_MS = 110;
const WALK_FRAME_DURATION_MS = 140;
const RUN_FRAME_DURATION_MS = 80;
const FLY_FRAME_COUNT = 4;
const MIN_HORIZONTAL_VELOCITY_FOR_PITCH = 12;
const PLAY_BOUNCE_FREQUENCY = 1.9;
const PLAY_BOUNCE_AMPLITUDE = 4.1;
const WADDLE_BOUNCE_AMPLITUDE = 2.8;
const WADDLE_SWAY_AMPLITUDE = 3.2;
const WADDLE_BODY_SWAY_AMPLITUDE = 1.8;
const WADDLE_BODY_BOB_AMPLITUDE = 1.5;
const WADDLE_BODY_TILT_DEGREES = 3.2;
const WADDLE_HEAD_SWAY_AMPLITUDE = 2.2;
const WADDLE_HEAD_BOB_AMPLITUDE = 1.2;
const WADDLE_HEAD_TILT_DEGREES = 9;
const WADDLE_CYCLE_FREQUENCY = 1.05;
const WADDLE_HEAD_CYCLE_FREQUENCY = 1.2;
const PECK_FREQUENCY = 1.8;
const PECK_AMPLITUDE = 3.4;
const PECK_ROTATION_RATIO = 2.6;
const SLEEP_HEAD_OFFSET_X = -0.8;
const SLEEP_HEAD_OFFSET_Y = 3.2;
const SLEEP_HEAD_ANGLE = 28;
const MOURN_HEAD_OFFSET_X = -0.5;
const MOURN_HEAD_OFFSET_Y = 2.4;
const MOURN_HEAD_ANGLE = 18;

// Waddle character — grounded floor-walker: much slower, wider, more pronounced animation
const WADDLE_CHAR_CYCLE_FREQ = 0.55;       // Slow deliberate step cycle
const WADDLE_CHAR_BODY_SWAY = 5.4;         // 3× wider side-to-side sway
const WADDLE_CHAR_BODY_BOB = 4.2;          // 2.8× more up-down bob
const WADDLE_CHAR_BODY_TILT = 9.6;         // 3× body tilt per step
const WADDLE_CHAR_HEAD_SWAY = 6.6;         // 3× head side sway
const WADDLE_CHAR_HEAD_DIP = 5.2;          // Head dips down as each foot lands
const WADDLE_CHAR_HEAD_TILT = 27;          // Strong neck angle per step

// Social directives bridge: stores gooseSocial API callbacks' effect on each goose
type SocialDirective = {
  away: boolean;
  chaseTarget: { x: number; y: number } | null;
  foodBag: boolean;
  sitting: boolean;
  fetchingFood: boolean;
  ballPlayActive: boolean;
};

const DEFAULT_DIRECTIVE: SocialDirective = {
  away: false,
  chaseTarget: null,
  foodBag: false,
  sitting: false,
  fetchingFood: false,
  ballPlayActive: false,
};

/** Apply gooseSocial directives to the sim state after each physics step. */
function applySimDirectives(state: GooseLifeState, directives: Map<string, SocialDirective>): GooseLifeState {
  if (directives.size === 0) return state;
  let changed = false;
  const geese = state.geese.map((goose) => {
    const d = directives.get(goose.id);
    if (!d) return goose;
    let g = goose;

    // sitting directive: force goose into eat/resting state
    if (d.sitting && g.state !== "eat") {
      g = { ...g, state: "eat" };
      changed = true;
    }

    // ballPlayActive: prevent sleep/idle while ball play is running
    if (!d.sitting && d.ballPlayActive && (g.state === "sleep" || g.state === "idle")) {
      g = { ...g, state: "fly" };
      changed = true;
    }

    // chaseTarget: steer velocity toward the ball
    if (d.chaseTarget && !d.sitting) {
      const dx = d.chaseTarget.x - g.position.x;
      const dy = d.chaseTarget.y - g.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const chaseSpeed = 140 * 4 * g.speedModifier; // 140 × SPEED_MULTIPLIER(4)
        g = {
          ...g,
          velocity: { x: (dx / dist) * chaseSpeed, y: (dy / dist) * chaseSpeed },
          state: "fly",
        };
        changed = true;
      }
    }

    return g;
  });
  return changed ? { ...state, geese } : state;
}

function bodyOpacity(goose: Goose, now: number) {
  if (goose.alive) return 1;
  if (!goose.bodyFadeStartAt) return 1;
  const progress = (now - goose.bodyFadeStartAt) / 20_000;
  return Math.max(0, 1 - progress);
}

function hashSeed(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  }
  return hash / 0xffffffff;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeSpeech(text: string) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  return collapsed.length > MAX_SPEECH_LENGTH
    ? `${collapsed.slice(0, MAX_SPEECH_LENGTH - 1).trimEnd()}…`
    : collapsed;
}

function isGosling(goose: Goose) {
  return (!!goose.isGosling || !!goose.parentIds) && goose.ageHours < 6;
}

function chooseAmbientSpeech(goose: Goose) {
  if (isGosling(goose)) return GOSLING_CHATTER[Math.floor(Math.random() * GOSLING_CHATTER.length)] ?? "peep!";
  return CLASSIC_CHATTER_POOL[Math.floor(Math.random() * CLASSIC_CHATTER_POOL.length)] ?? "honk";
}

function gooseVariant(goose: Goose): GooseVariant {
  if (isGosling(goose)) return goose.sex === "female" ? "gosling-brown" : "gosling-white";
  return goose.sex === "female" ? "brown" : "white";
}

function getGooseVisualMode(goose: Goose): GooseVisualMode {
  const speed = Math.hypot(goose.velocity.x, goose.velocity.y);
  if (!goose.alive || goose.state === "sleep" || goose.state === "mourn" || goose.state === "interact" || goose.state === "eat") return "perched";
  if (goose.state === "fly") return "fly";
  if (goose.state === "play") return speed > 160 && !isGosling(goose) ? "fly" : "run";
  if (goose.state === "waddle" || goose.state === "follow" || goose.state === "idle") return "walk";
  return speed > 140 && !isGosling(goose) ? "fly" : "walk";
}

function collectPerches(root: HTMLDivElement, bounds: StageBounds): StageBounds["perches"] {
  const stageRect = root.getBoundingClientRect();
  const picked: NonNullable<StageBounds["perches"]> = [];
  const elems = document.querySelectorAll<HTMLElement>("[data-goose-letter], [data-goose-perch]");

  elems.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = rect.left - stageRect.left + rect.width * 0.5;
    const y = rect.top - stageRect.top + rect.height * 0.25;
    picked.push({
      x: clamp(x, 24, Math.max(24, bounds.width - 24)),
      y: clamp(y, 50, Math.max(50, bounds.height - 24)),
      kind: el.hasAttribute("data-goose-letter") ? "letter" : "window",
    });
  });

  const floorY = bounds.height * 0.84;
  picked.push({ x: bounds.width * 0.15, y: floorY, kind: "floor" });
  picked.push({ x: bounds.width * 0.5, y: floorY, kind: "floor" });
  picked.push({ x: bounds.width * 0.85, y: floorY, kind: "floor" });
  return picked;
}

const GooseLifeSimulation = ({ oneliners = [] }: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number>(0);
  const persistAtRef = useRef<number>(0);
  const stateRef = useRef<GooseLifeState | null>(null);
  const latestOnelinerRef = useRef<OnelinerEntry | null>(oneliners[0] ?? null);
  const lastSpokenOnelinerKeyRef = useRef<string | null>(null);
  const speechesRef = useRef<Record<string, GooseSpeech>>({});
  const boundsRef = useRef<StageBounds>({ width: window.innerWidth, height: window.innerHeight, perches: [] });
  // Mutable ref for social directives — written by gooseSocial callbacks, read each tick.
  const socialDirectivesRef = useRef<Map<string, SocialDirective>>(new Map());
  // Stable ref to upsertSpeech so it can be closed over by gooseSocial API objects.
  const upsertSpeechRef = useRef<(id: string, text: string, durationMs: number) => void>(() => {});
  const [bounds, setBounds] = useState<StageBounds>({ width: window.innerWidth, height: window.innerHeight, perches: [] });
  const [state, setState] = useState<GooseLifeState>(() => loadGooseLifeState() ?? createInitialGooseLifeState(Date.now()));
  const [now, setNow] = useState(Date.now());
  const [speeches, setSpeeches] = useState<Record<string, GooseSpeech>>({});

  const gooseFrames = useMemo(
    () => ({
      white: buildGooseFrameDataUrls("white"),
      brown: buildGooseFrameDataUrls("brown"),
      "gosling-white": buildGooseFrameDataUrls("gosling-white"),
      "gosling-brown": buildGooseFrameDataUrls("gosling-brown"),
    }),
    [],
  );
  const spriteScale = useMemo(() => {
    const scale = Math.min(bounds.width / 1280, bounds.height / 720);
    return DEFAULT_SPRITE_SCALE_FACTOR * clamp(scale || 1, 0.7, 1.2);
  }, [bounds.height, bounds.width]);
  const spriteWidth = BASE_SPRITE_W * spriteScale;
  const spriteHeight = BASE_SPRITE_H * spriteScale;
  const headPivotX = NECK_PIVOT_X_PX * spriteScale;
  const headPivotY = NECK_PIVOT_Y_PX * spriteScale;

  const upsertSpeech = (gooseId: string, text: string, durationMs: number) => {
    const normalized = normalizeSpeech(text);
    if (!normalized) return;
    const next = {
      ...speechesRef.current,
      [gooseId]: { text: normalized, until: Date.now() + durationMs },
    };
    speechesRef.current = next;
    setSpeeches(next);
  };

  // Keep the stable ref in sync so gooseSocial API closures always call the current version.
  upsertSpeechRef.current = upsertSpeech;

  const pruneSpeeches = (timestamp: number) => {
    let changed = false;
    const next: Record<string, GooseSpeech> = {};
    for (const [key, speech] of Object.entries(speechesRef.current)) {
      if (speech.until > timestamp) next[key] = speech;
      else changed = true;
    }
    if (!changed) return;
    speechesRef.current = next;
    setSpeeches(next);
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    latestOnelinerRef.current = oneliners[0] ?? null;
  }, [oneliners]);

  useEffect(() => {
    const target = rootRef.current;
    if (!target) return;
    const resize = () => {
      const r = target.getBoundingClientRect();
      const nextBounds: StageBounds = { width: r.width, height: r.height, perches: [] };
      nextBounds.perches = collectPerches(target, nextBounds);
      const prev = boundsRef.current;
      const prevPerches = prev.perches ?? [];
      const nextPerches = nextBounds.perches;
      const sameSize = prev.width === nextBounds.width && prev.height === nextBounds.height;
      const samePerches =
        prevPerches.length === nextPerches.length &&
        prevPerches.every((p, i) => p.x === nextPerches[i].x && p.y === nextPerches[i].y && p.kind === nextPerches[i].kind);
      if (sameSize && samePerches) return;
      boundsRef.current = nextBounds;
      setBounds(nextBounds);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(target);
    const perchInterval = window.setInterval(resize, PERCH_UPDATE_INTERVAL_MS);
    return () => {
      ro.disconnect();
      window.clearInterval(perchInterval);
    };
  }, []);

  useEffect(() => {
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;
      const tickNow = Date.now();
      setNow(tickNow);
      pruneSpeeches(tickNow);
      setState((prev) => {
        const latest = latestOnelinerRef.current;
        const onelinerKey = latest ? `${latest.time}|${latest.username}|${latest.text}` : null;
        const withReaction = latest && onelinerKey
          ? maybeApplyLatestOneliner(prev, latest.text, onelinerKey, tickNow)
          : prev;
        const stepped = stepGooseLife(withReaction, tickNow, dt, bounds);
        // Apply gooseSocial directives (ball chase, sitting, food fetch, etc.) each tick.
        const withDirectives = applySimDirectives(stepped, socialDirectivesRef.current);
        if (tickNow >= persistAtRef.current) {
          saveGooseLifeState(withDirectives);
          persistAtRef.current = tickNow + 5_000;
        }
        return withDirectives;
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      if (stateRef.current) saveGooseLifeState(stateRef.current);
    };
  }, [bounds]);

  // Gosling ambient chatter only — adult speech is handled by gooseSocial turn-taking system.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const tickNow = Date.now();
      pruneSpeeches(tickNow);
      const current = stateRef.current;
      if (!current) return;
      const goslings = current.geese.filter(
        (goose) => goose.alive && isGosling(goose) && goose.state !== "sleep" && goose.state !== "mourn",
      );
      if (goslings.length === 0) return;
      if (Math.random() > GOSLING_AMBIENT_SPEECH_PROBABILITY) return;
      const gosling = goslings[Math.floor(Math.random() * goslings.length)];
      if (!gosling) return;
      upsertSpeechRef.current(
        gosling.id,
        GOSLING_CHATTER[Math.floor(Math.random() * GOSLING_CHATTER.length)] ?? "peep!",
        MIN_AMBIENT_SPEECH_DURATION_MS + Math.random() * AMBIENT_SPEECH_DURATION_VARIANCE_MS,
      );
    }, GOSLING_AMBIENT_SPEECH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  // Register the founding female (brown) and male (white) geese with gooseSocial.
  // This wires up the non-sim ball play, food fetching, and turn-taking chatter system.
  useEffect(() => {
    const current = stateRef.current ?? state;
    // The founding pair are the first female and first male in the initial state.
    const foundingFemale = current.geese.find((g) => g.sex === "female" && !g.isGosling && !g.parentIds && !g.grounded);
    const foundingMale = current.geese.find((g) => g.sex === "male" && !g.isGosling && !g.parentIds);
    if (!foundingFemale || !foundingMale) return;

    const buildApi = (gooseId: string, role: GooseRole): GooseAPI => {
      const getDirective = () => {
        const d = socialDirectivesRef.current.get(gooseId);
        if (d) return d;
        const fresh: SocialDirective = { ...DEFAULT_DIRECTIVE };
        socialDirectivesRef.current.set(gooseId, fresh);
        return fresh;
      };
      const setDirective = (patch: Partial<SocialDirective>) => {
        const current = getDirective();
        socialDirectivesRef.current.set(gooseId, { ...current, ...patch });
      };
      return {
        variant: role,
        say: (text: string, durationMs = 2400) => {
          upsertSpeechRef.current(gooseId, text, durationMs);
        },
        getPosition: () => {
          const g = stateRef.current?.geese.find((x) => x.id === gooseId);
          return g?.position ?? { x: 400, y: 400 };
        },
        setAway: (away: boolean) => setDirective({ away }),
        setChaseTarget: (target: { x: number; y: number } | null) => setDirective({ chaseTarget: target }),
        setFoodBag: (foodBag: boolean) => setDirective({ foodBag }),
        setSitting: (sitting: boolean) => setDirective({ sitting }),
        setFetchingFood: (fetchingFood: boolean) => setDirective({ fetchingFood }),
        setBallPlayActive: (ballPlayActive: boolean) => setDirective({ ballPlayActive }),
      };
    };

    const unregisterFemale = registerGoose(buildApi(foundingFemale.id, "brown"));
    const unregisterMale = registerGoose(buildApi(foundingMale.id, "white"));

    return () => {
      unregisterFemale();
      unregisterMale();
      socialDirectivesRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const latest = oneliners[0];
    if (!latest) return;
    const key = `${latest.time}|${latest.username}|${latest.text}`;
    if (lastSpokenOnelinerKeyRef.current === null) {
      lastSpokenOnelinerKeyRef.current = key;
      return;
    }
    if (key === lastSpokenOnelinerKeyRef.current) return;
    lastSpokenOnelinerKeyRef.current = key;
    // Notify gooseSocial so it can react to the oneliner with context-aware dialogue
    noteRecentOneliner(latest.username ?? "someone", latest.text);
    const current = stateRef.current;
    if (!current) return;
    const speakers = current.geese.filter((goose) => goose.alive && goose.state !== "sleep");
    if (speakers.length === 0) return;
    const speaker = speakers[Math.floor(Math.random() * speakers.length)];
    upsertSpeech(speaker.id, latest.text, ONELINER_SPEECH_DURATION_MS);
  }, [oneliners]);

  const living = useMemo(() => state.geese.filter((goose) => goose.alive), [state.geese]);
  const maxAge = useMemo(
    () => state.geese.reduce((max, goose) => Math.max(max, goose.ageHours), 0),
    [state.geese],
  );
  const currentDay = dayFromAgeHours(maxAge);
  const totalDays = dayFromAgeHours(LIFESPAN_HOURS);

  return (
    <div ref={rootRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 62 }} data-testid="goose-life-sim">
      <div className="absolute top-14 left-2 rounded-sm border border-border bg-card/60 px-2 py-1 text-[10px] uppercase tracking-widest text-foreground">
        Goose Life · Day {currentDay}/{totalDays} · Oldest {maxAge.toFixed(1)}h · Flock {living.length}
      </div>
      {state.geese.map((goose) => {
        if (goose.bodyRemoved) return null;
        // Don't render geese that are "away" (flying off-screen via gooseSocial directive).
        const directive = socialDirectivesRef.current.get(goose.id);
        if (directive?.away) return null;
        const gosling = isGosling(goose);
        const spriteSizeScale = gosling ? GOSLING_SCALE_FACTOR : 1;
        const width = spriteWidth * spriteSizeScale;
        const height = spriteHeight * spriteSizeScale;
        const pivotX = headPivotX * spriteSizeScale;
        const pivotY = headPivotY * spriteSizeScale;
        const opacity = bodyOpacity(goose, now);
        const seed = hashSeed(goose.id);
        const direction = goose.velocity.x < 0 ? -1 : 1;
        const phaseMs = now + seed * PHASE_OFFSET_MULTIPLIER_MS;
        const phase = phaseMs / 180;
        const variant = gooseVariant(goose);
        const frames = gooseFrames[variant];
        const speech = speeches[goose.id];
        const visualMode = getGooseVisualMode(goose);

        // Waddle character: grounded floor-walker uses a distinct slow waddling animation.
        const isWaddleChar = !!goose.grounded;
        const waddleCharPhase = phaseMs / 180;
        const waddleCharCycle = Math.sin(waddleCharPhase * WADDLE_CHAR_CYCLE_FREQ);
        const waddleCharStepLanding = Math.abs(waddleCharCycle); // peaks when foot lands

        const frameDuration = visualMode === "run" ? RUN_FRAME_DURATION_MS : visualMode === "walk" ? WALK_FRAME_DURATION_MS : FLY_FRAME_DURATION_MS;
        const frameIndex = Math.floor((phaseMs / frameDuration) % FLY_FRAME_COUNT);
        const flyHeadBob = Math.sin(phase * 1.2) * spriteScale;
        const flyPitch = clamp(
          Math.atan2(
            goose.velocity.y,
            Math.max(MIN_HORIZONTAL_VELOCITY_FOR_PITCH, Math.abs(goose.velocity.x)),
          ) * (180 / Math.PI),
          -22,
          22,
        );

        // Body animation: Waddle character uses exaggerated slow waddling transforms.
        let walkStrideX: number;
        let walkStrideY: number;
        let walkTilt: number;
        let walkHeadNudgeX: number;
        let walkHeadNudgeY: number;
        let walkHeadTilt: number;

        if (isWaddleChar && visualMode === "walk") {
          // Distinct waddling gait: big lateral sway, deep bob, strong tilt — like a real duck walk
          walkStrideX = waddleCharCycle * WADDLE_CHAR_BODY_SWAY * spriteScale;
          walkStrideY = waddleCharStepLanding * WADDLE_CHAR_BODY_BOB * spriteScale;
          walkTilt = waddleCharCycle * WADDLE_CHAR_BODY_TILT;
          // Head dips toward ground each time a foot lands, then comes back up
          walkHeadNudgeX = Math.sin(waddleCharPhase * WADDLE_CHAR_CYCLE_FREQ * 0.9) * WADDLE_CHAR_HEAD_SWAY * spriteScale;
          walkHeadNudgeY = waddleCharStepLanding * WADDLE_CHAR_HEAD_DIP * spriteScale;
          walkHeadTilt = Math.sin(waddleCharPhase * WADDLE_CHAR_CYCLE_FREQ * 1.1) * WADDLE_CHAR_HEAD_TILT;
        } else {
          const waddling = visualMode === "walk";
          const walkCycle = Math.sin(phase * WADDLE_CYCLE_FREQUENCY);
          walkStrideX = waddling ? walkCycle * WADDLE_BODY_SWAY_AMPLITUDE * spriteScale : 0;
          walkStrideY = waddling ? Math.abs(walkCycle) * WADDLE_BODY_BOB_AMPLITUDE * spriteScale : 0;
          walkTilt = waddling ? walkCycle * WADDLE_BODY_TILT_DEGREES : 0;
          walkHeadNudgeX = waddling ? Math.sin(phase * WADDLE_HEAD_CYCLE_FREQUENCY) * WADDLE_HEAD_SWAY_AMPLITUDE * spriteScale : 0;
          walkHeadNudgeY = waddling ? Math.abs(Math.sin(phase * WADDLE_HEAD_CYCLE_FREQUENCY)) * WADDLE_HEAD_BOB_AMPLITUDE * spriteScale : 0;
          walkHeadTilt = waddling ? Math.sin(phase * WADDLE_HEAD_CYCLE_FREQUENCY) * WADDLE_HEAD_TILT_DEGREES : 0;
        }

        const groundedBounce =
          goose.state === "play"
            ? Math.abs(Math.sin(phase * PLAY_BOUNCE_FREQUENCY)) * PLAY_BOUNCE_AMPLITUDE * spriteScale
            : goose.state === "waddle" || goose.state === "follow"
              ? Math.abs(Math.sin(phase)) * WADDLE_BOUNCE_AMPLITUDE * spriteScale
              : Math.sin(phase * 0.55) * 0.8 * spriteScale;
        const groundedSway =
          goose.state === "waddle" || goose.state === "follow" || goose.state === "play"
            ? Math.sin(phase * (visualMode === "run" ? 1.6 : 0.8)) * WADDLE_SWAY_AMPLITUDE * spriteScale
            : 0;

        let headTransform = "translate(0px, 0px) rotate(0deg)";
        if (goose.state === "eat") {
          const peck = Math.abs(Math.sin(phase * PECK_FREQUENCY)) * PECK_AMPLITUDE * spriteScale;
          headTransform = `translate(0px, ${peck}px) rotate(${peck * PECK_ROTATION_RATIO}deg)`;
        } else if (goose.state === "sleep") {
          headTransform = `translate(${SLEEP_HEAD_OFFSET_X * spriteScale}px, ${SLEEP_HEAD_OFFSET_Y * spriteScale}px) rotate(${SLEEP_HEAD_ANGLE}deg)`;
        } else if (goose.state === "mourn") {
          headTransform = `translate(${MOURN_HEAD_OFFSET_X * spriteScale}px, ${MOURN_HEAD_OFFSET_Y * spriteScale}px) rotate(${MOURN_HEAD_ANGLE}deg)`;
        } else if (goose.state === "play") {
          headTransform = `translate(${Math.sin(phase * 1.3) * 1.7 * spriteScale}px, ${Math.cos(phase * 1.2) * 0.9 * spriteScale}px) rotate(${Math.sin(phase * 1.6) * 18}deg)`;
        } else {
          headTransform = `translate(${Math.sin(phase * 0.7) * 1.6 * spriteScale}px, ${Math.cos(phase * 0.9) * 0.7 * spriteScale}px) rotate(${Math.sin(phase * 0.7) * 12}deg)`;
        }

        const spriteTransform =
          visualMode === "fly"
            ? `translate3d(${goose.position.x - width / 2}px, ${goose.position.y - height / 2 + flyHeadBob}px, 0) rotate(${direction < 0 ? -flyPitch : flyPitch}deg) scaleX(${direction})`
            : `translate3d(${goose.position.x - width / 2 + groundedSway}px, ${goose.position.y - height / 2 + groundedBounce}px, 0) scaleX(${direction})`;

        return (
          <Fragment key={goose.id}>
            <div
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width,
                height,
                opacity,
                transform: spriteTransform,
                transformOrigin: "center center",
                willChange: "transform",
                filter:
                  goose.mood === "mourning"
                    ? "drop-shadow(0 0 10px rgba(120,160,255,0.35))"
                    : "drop-shadow(0 2px 0 rgba(0,0,0,0.28))",
              }}
            >
              <img
                src={frames[frameIndex]}
                alt=""
                width={width}
                height={height}
                style={{
                  position: "absolute",
                  inset: 0,
                  width,
                  height,
                  imageRendering: "pixelated",
                  opacity: visualMode === "fly" || visualMode === "run" ? 1 : 0,
                }}
              />
              <img
                src={frames[STAND_BODY]}
                alt=""
                width={width}
                height={height}
                style={{
                  position: "absolute",
                  inset: 0,
                  width,
                  height,
                  imageRendering: "pixelated",
                  opacity: visualMode === "perched" || visualMode === "walk" ? 1 : 0,
                  transform: visualMode === "walk" ? `translate(${walkStrideX}px, ${walkStrideY}px) rotate(${walkTilt}deg)` : "none",
                }}
              />
              <img
                src={frames[STAND_HEAD]}
                alt=""
                width={width}
                height={height}
                style={{
                  position: "absolute",
                  inset: 0,
                  width,
                  height,
                  imageRendering: "pixelated",
                  opacity: visualMode === "perched" || visualMode === "walk" ? 1 : 0,
                  transformOrigin: `${pivotX}px ${pivotY}px`,
                  transform: visualMode === "walk"
                    ? `translate(${walkHeadNudgeX}px, ${walkHeadNudgeY}px) rotate(${walkHeadTilt}deg)`
                    : visualMode === "perched" ? headTransform : "none",
                }}
              />
            </div>
            <div
              className="absolute left-1/2 whitespace-nowrap rounded-sm bg-card/65 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground"
              style={{
                left: goose.position.x,
                top: goose.position.y - height / 2 - 16,
                opacity,
                transform: "translateX(-50%)",
              }}
            >
              {goose.name} · {gosling ? "gosling" : stateLabel[goose.state]}
            </div>
            {speech && speech.until > now && (
              <div
                className="absolute"
                style={{
                  left: goose.position.x + 6,
                  top: goose.position.y - height / 2 - 22,
                  opacity,
                  transform: "translateY(-100%)",
                  padding: "4px 10px",
                  background: "#fff",
                  color: "#1a1a1a",
                  fontWeight: 900,
                  fontSize: 14,
                  letterSpacing: "0.04em",
                  border: "2px solid #1a1a1a",
                  borderRadius: 8,
                  boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
                  whiteSpace: "nowrap",
                  zIndex: 70,
                }}
              >
                {speech.text}
              </div>
            )}
            {goose.pregnant && (
              <div
                className="absolute text-[10px]"
                style={{ left: goose.position.x + width * 0.2, top: goose.position.y - height * 0.25, opacity }}
              >
                🥚
              </div>
            )}
            {goose.eggs && goose.eggs.length > 0 && (
              <div
                className="absolute whitespace-nowrap text-[9px] text-foreground/90"
                style={{ left: goose.position.x - width * 0.35, top: goose.position.y + height * 0.2, opacity }}
              >
                {goose.eggs.length} eggs
              </div>
            )}
            {directive?.foodBag && (
              <div
                className="absolute text-[11px]"
                style={{ left: goose.position.x + width * 0.25, top: goose.position.y - height * 0.2, opacity }}
              >
                🛍️
              </div>
            )}
          </Fragment>
        );
      })}
      {state.funeralPulseUntil && now < state.funeralPulseUntil && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(90,120,255,0.18) 0%, rgba(60,80,160,0.08) 24%, rgba(0,0,0,0) 65%)",
            animation: "pulse 4s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );
};

export default GooseLifeSimulation;
