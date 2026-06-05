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

type Props = {
  oneliners?: OnelinerEntry[];
};

type GooseSpeech = {
  text: string;
  until: number;
};

type GooseVisualMode = "fly" | "ground" | "perched";

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

const AMBIENT_CHATTER: Partial<Record<Goose["state"], string[]>> = {
  idle: ["honk", "just vibing", "nice day"],
  waddle: ["waddle waddle", "coming through", "beep beak"],
  fly: ["flap flap", "air route clear", "zoom honk"],
  eat: ["snack time", "crumb patrol", "nom nom"],
  sleep: ["zzz", "soft honk..."],
  play: ["wheee", "tag youre it", "happy flap"],
  interact: ["hiya honk", "good goose day", "lets chat"],
  mourn: ["...", "miss you"],
  follow: ["wait up", "right behind you", "tiny flap"],
};

const MAX_SPEECH_LENGTH = 42;
const DEFAULT_SPRITE_SCALE_FACTOR = 0.78;
const AMBIENT_SPEECH_INTERVAL_MS = 2600;
const MIN_AMBIENT_SPEECH_DURATION_MS = 1800;
const AMBIENT_SPEECH_DURATION_VARIANCE_MS = 1400;
const AMBIENT_SPEECH_PROBABILITY = 0.6;
const ONELINER_SPEECH_DURATION_MS = 2800;
const PHASE_OFFSET_MULTIPLIER_MS = 2000;
const FLY_FRAME_DURATION_MS = 110;
const FLY_FRAME_COUNT = 4;
const MIN_HORIZONTAL_VELOCITY_FOR_PITCH = 12;
const PLAY_BOUNCE_FREQUENCY = 1.4;
const PLAY_BOUNCE_AMPLITUDE = 3.5;
const WADDLE_BOUNCE_AMPLITUDE = 2.2;
const WADDLE_SWAY_AMPLITUDE = 2.6;
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

function chooseAmbientSpeech(goose: Goose) {
  const options = AMBIENT_CHATTER[goose.state] ?? AMBIENT_CHATTER.idle ?? [];
  if (options.length === 0) return "";
  return options[Math.floor(Math.random() * options.length)];
}

function gooseVariant(goose: Goose): GooseVariant {
  return goose.sex === "female" ? "brown" : "white";
}

function getGooseVisualMode(goose: Goose) {
  const speed = Math.hypot(goose.velocity.x, goose.velocity.y);
  if (!goose.alive || goose.state === "sleep" || goose.state === "mourn") return "perched";
  if (goose.state === "fly") return "fly";
  if (goose.state === "waddle" || goose.state === "follow") return "ground";
  if (goose.state === "play") return speed > 36 ? "fly" : "ground";
  if (goose.state === "eat") return "ground";
  if (goose.state === "interact") return "perched";
  return speed > 44 ? "fly" : "perched";
}

const GooseLifeSimulation = ({ oneliners = [] }: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number>(0);
  const persistAtRef = useRef<number>(0);
  const stateRef = useRef<GooseLifeState | null>(null);
  const latestOnelinerRef = useRef<OnelinerEntry | null>(oneliners[0] ?? null);
  const lastSpokenOnelinerKeyRef = useRef<string | null>(null);
  const speechesRef = useRef<Record<string, GooseSpeech>>({});
  const [bounds, setBounds] = useState<StageBounds>({ width: window.innerWidth, height: window.innerHeight });
  const [state, setState] = useState<GooseLifeState>(() => loadGooseLifeState() ?? createInitialGooseLifeState(Date.now()));
  const [now, setNow] = useState(Date.now());
  const [speeches, setSpeeches] = useState<Record<string, GooseSpeech>>({});

  const gooseFrames = useMemo(
    () => ({
      white: buildGooseFrameDataUrls("white"),
      brown: buildGooseFrameDataUrls("brown"),
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
      setBounds({ width: r.width, height: r.height });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(target);
    return () => ro.disconnect();
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
      if (visibleSpeechCount > Math.max(1, Math.floor(speakers.length / 2))) return;
      if (Math.random() > AMBIENT_SPEECH_PROBABILITY) return;
      const goose = speakers[Math.floor(Math.random() * speakers.length)];
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
      // Ignore the first item on mount so the flock only reacts to new chatter.
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
        Goose Life · Day {currentDay}/{totalDays} · Flock {living.length}
      </div>
      {state.geese.map((goose) => {
        if (goose.bodyRemoved) return null;
        const opacity = bodyOpacity(goose, now);
        const seed = hashSeed(goose.id);
        const direction = goose.velocity.x < 0 ? -1 : 1;
        const phaseMs = now + seed * PHASE_OFFSET_MULTIPLIER_MS;
        const phase = phaseMs / 180;
        const variant = gooseVariant(goose);
        const frames = gooseFrames[variant];
        const speech = speeches[goose.id];
        const visualMode = getGooseVisualMode(goose);
        const frameIndex = Math.floor((phaseMs / FLY_FRAME_DURATION_MS) % FLY_FRAME_COUNT);
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
          goose.state === "waddle" || goose.state === "follow"
            ? Math.sin(phase * 0.8) * WADDLE_SWAY_AMPLITUDE * spriteScale
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
          headTransform = `translate(${Math.sin(phase * 1.3) * 1.5 * spriteScale}px, ${Math.cos(phase * 1.2) * 0.8 * spriteScale}px) rotate(${Math.sin(phase * 1.4) * 14}deg)`;
        } else {
          headTransform = `translate(${Math.sin(phase * 0.7) * 1.6 * spriteScale}px, ${Math.cos(phase * 0.9) * 0.7 * spriteScale}px) rotate(${Math.sin(phase * 0.7) * 12}deg)`;
        }

        const spriteTransform =
          visualMode === "fly"
            ? `translate3d(${goose.position.x - spriteWidth / 2}px, ${goose.position.y - spriteHeight / 2 + flyHeadBob}px, 0) rotate(${direction < 0 ? -flyPitch : flyPitch}deg) scaleX(${direction})`
            : `translate3d(${goose.position.x - spriteWidth / 2 + groundedSway}px, ${goose.position.y - spriteHeight / 2 + groundedBounce}px, 0) scaleX(${direction})`;

        return (
          <Fragment key={goose.id}>
            <div
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width: spriteWidth,
                height: spriteHeight,
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
                width={spriteWidth}
                height={spriteHeight}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: spriteWidth,
                  height: spriteHeight,
                  imageRendering: "pixelated",
                  opacity: visualMode === "fly" ? 1 : 0,
                }}
              />
              <img
                src={frames[STAND_BODY]}
                alt=""
                width={spriteWidth}
                height={spriteHeight}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: spriteWidth,
                  height: spriteHeight,
                  imageRendering: "pixelated",
                  opacity: visualMode === "fly" ? 0 : 1,
                }}
              />
              <img
                src={frames[STAND_HEAD]}
                alt=""
                width={spriteWidth}
                height={spriteHeight}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: spriteWidth,
                  height: spriteHeight,
                  imageRendering: "pixelated",
                  opacity: visualMode === "fly" ? 0 : 1,
                  transformOrigin: `${headPivotX}px ${headPivotY}px`,
                  transform: visualMode === "fly" ? "none" : headTransform,
                }}
              />
            </div>
            <div
              className="absolute left-1/2 whitespace-nowrap rounded-sm bg-card/65 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground"
              style={{
                left: goose.position.x,
                top: goose.position.y - spriteHeight / 2 - 16,
                opacity,
                transform: "translateX(-50%)",
              }}
            >
              {goose.name} · {stateLabel[goose.state]}
            </div>
            {speech && speech.until > now && (
              <div
                className="absolute rounded-md border border-foreground/80 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-black shadow-[2px_2px_0_rgba(0,0,0,0.35)]"
                style={{
                  left: goose.position.x + 6,
                  top: goose.position.y - spriteHeight / 2 - 22,
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
                style={{ left: goose.position.x + spriteWidth * 0.2, top: goose.position.y - spriteHeight * 0.25, opacity }}
              >
                🥚
              </div>
            )}
            {goose.eggs && goose.eggs.length > 0 && (
              <div
                className="absolute whitespace-nowrap text-[9px] text-foreground/90"
                style={{ left: goose.position.x - spriteWidth * 0.35, top: goose.position.y + spriteHeight * 0.2, opacity }}
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
