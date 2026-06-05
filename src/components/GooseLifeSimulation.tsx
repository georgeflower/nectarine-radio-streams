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
const AMBIENT_SPEECH_INTERVAL_MS = 2600;
const MIN_AMBIENT_SPEECH_DURATION_MS = 1800;
const AMBIENT_SPEECH_DURATION_VARIANCE_MS = 1400;
const AMBIENT_SPEECH_PROBABILITY = 0.62;
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
const PECK_FREQUENCY = 1.8;
const PECK_AMPLITUDE = 3.4;
const PECK_ROTATION_RATIO = 2.6;
const SLEEP_HEAD_OFFSET_X = -0.8;
const SLEEP_HEAD_OFFSET_Y = 3.2;
const SLEEP_HEAD_ANGLE = 28;
const MOURN_HEAD_OFFSET_X = -0.5;
const MOURN_HEAD_OFFSET_Y = 2.4;
const MOURN_HEAD_ANGLE = 18;

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
  const lastAmbientSpeakerRef = useRef<string | null>(null);
  const pendingAmbientReplyRef = useRef<string | null>(null);
  const speechesRef = useRef<Record<string, GooseSpeech>>({});
  const boundsRef = useRef<StageBounds>({ width: window.innerWidth, height: window.innerHeight, perches: [] });
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
        if (tickNow >= persistAtRef.current) {
          saveGooseLifeState(stepped);
          persistAtRef.current = tickNow + 5_000;
        }
        return stepped;
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      if (stateRef.current) saveGooseLifeState(stateRef.current);
    };
  }, [bounds]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const tickNow = Date.now();
      pruneSpeeches(tickNow);
      const current = stateRef.current;
      if (!current) return;
      const speakers = current.geese.filter(
        (goose) => goose.alive && goose.state !== "sleep" && goose.state !== "mourn",
      );
      if (speakers.length === 0) return;
      const visibleSpeechCount = Object.keys(speechesRef.current).length;
      if (visibleSpeechCount > 0) return;
      let goose: Goose | null = null;
      if (pendingAmbientReplyRef.current) {
        goose = speakers.find((candidate) => candidate.id === pendingAmbientReplyRef.current) ?? null;
        pendingAmbientReplyRef.current = null;
      } else {
        if (Math.random() > AMBIENT_SPEECH_PROBABILITY) return;
        const preferred = speakers.filter((candidate) => candidate.id !== lastAmbientSpeakerRef.current);
        const pickFrom = preferred.length > 0 ? preferred : speakers;
        goose = pickFrom[Math.floor(Math.random() * pickFrom.length)] ?? null;
      }
      if (!goose) return;
      const possibleReply = speakers.filter((candidate) => candidate.id !== goose.id);
      if (possibleReply.length > 0) {
        pendingAmbientReplyRef.current = possibleReply[Math.floor(Math.random() * possibleReply.length)]?.id ?? null;
      }
      lastAmbientSpeakerRef.current = goose.id;
      upsertSpeech(
        goose.id,
        chooseAmbientSpeech(goose),
        MIN_AMBIENT_SPEECH_DURATION_MS + Math.random() * AMBIENT_SPEECH_DURATION_VARIANCE_MS,
      );
    }, AMBIENT_SPEECH_INTERVAL_MS);
    return () => window.clearInterval(interval);
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
        const waddling = visualMode === "walk";
        const walkCycle = Math.sin(phase * 1.05);
        const walkStrideX = waddling ? walkCycle * WADDLE_BODY_SWAY_AMPLITUDE * spriteScale : 0;
        const walkStrideY = waddling ? Math.abs(walkCycle) * WADDLE_BODY_BOB_AMPLITUDE * spriteScale : 0;
        const walkTilt = waddling ? walkCycle * WADDLE_BODY_TILT_DEGREES : 0;
        const walkHeadNudgeX = waddling ? Math.sin(phase * 1.2) * WADDLE_HEAD_SWAY_AMPLITUDE * spriteScale : 0;
        const walkHeadNudgeY = waddling ? Math.abs(Math.sin(phase * 1.2)) * WADDLE_HEAD_BOB_AMPLITUDE * spriteScale : 0;
        const walkHeadTilt = waddling ? Math.sin(phase * 1.2) * WADDLE_HEAD_TILT_DEGREES : 0;

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
                className="absolute rounded-md border border-foreground/80 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-black shadow-[2px_2px_0_rgba(0,0,0,0.35)]"
                style={{
                  left: goose.position.x + 6,
                  top: goose.position.y - height / 2 - 22,
                  opacity,
                  transform: "translateY(-100%)",
                  maxWidth: 180,
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
