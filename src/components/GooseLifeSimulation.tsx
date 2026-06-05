import { useEffect, useMemo, useRef, useState } from "react";
import type { OnelinerEntry } from "@/lib/nectarine";
import {
  createInitialGooseLifeState,
  dayFromAgeHours,
  loadGooseLifeState,
  maybeApplyLatestOneliner,
  saveGooseLifeState,
  stepGooseLife,
  type Goose,
  type GooseLifeState,
  type StageBounds,
} from "@/lib/gooseLife";

type Props = {
  oneliners?: OnelinerEntry[];
};

const GOOSE_SIZE = 26;

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

function gooseTint(goose: Goose) {
  const base = goose.sex === "female" ? 46 : 38;
  const moodBoost = goose.mood === "happy" ? 8 : goose.mood === "mourning" ? -12 : 0;
  return `hsl(${base + goose.paletteShift}, ${45 + moodBoost}%, ${goose.alive ? 72 : 48}%)`;
}

function bodyOpacity(goose: Goose, now: number) {
  if (goose.alive) return 1;
  if (!goose.bodyFadeStartAt) return 1;
  const progress = (now - goose.bodyFadeStartAt) / 20_000;
  return Math.max(0, 1 - progress);
}

const GooseLifeSimulation = ({ oneliners = [] }: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number>(0);
  const persistAtRef = useRef<number>(0);
  const stateRef = useRef<GooseLifeState | null>(null);
  const latestOnelinerRef = useRef<OnelinerEntry | null>(oneliners[0] ?? null);
  const [bounds, setBounds] = useState<StageBounds>({ width: window.innerWidth, height: window.innerHeight });
  const [state, setState] = useState<GooseLifeState>(() => loadGooseLifeState() ?? createInitialGooseLifeState(Date.now()));
  const [now, setNow] = useState(Date.now());

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
      setState((prev) => {
        const latest = latestOnelinerRef.current;
        const onelinerKey = latest ? `${latest.time}|${latest.username}|${latest.text}` : null;
        const withReaction = latest && onelinerKey
          ? maybeApplyLatestOneliner(prev, latest.text, onelinerKey)
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

  const living = useMemo(() => state.geese.filter((goose) => goose.alive), [state.geese]);
  const maxAge = useMemo(
    () => state.geese.reduce((max, goose) => Math.max(max, goose.ageHours), 0),
    [state.geese],
  );
  const currentDay = dayFromAgeHours(maxAge);

  return (
    <div ref={rootRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 62 }} data-testid="goose-life-sim">
      <div className="absolute top-14 left-2 rounded-sm border border-border bg-card/60 px-2 py-1 text-[10px] uppercase tracking-widest text-foreground">
        Goose Life · Day {currentDay}/48 · Flock {living.length}
      </div>
      {state.geese.map((goose) => {
        if (goose.bodyRemoved) return null;
        const opacity = bodyOpacity(goose, now);
        return (
          <div
            key={goose.id}
            className="absolute"
            style={{
              left: goose.position.x - GOOSE_SIZE / 2,
              top: goose.position.y - GOOSE_SIZE / 2,
              width: GOOSE_SIZE,
              height: GOOSE_SIZE,
              opacity,
              transform: goose.state === "fly" ? "translateY(-6px)" : "none",
              transition: "transform 0.18s linear",
            }}
          >
            <div
              style={{
                width: GOOSE_SIZE,
                height: GOOSE_SIZE,
                borderRadius: 999,
                background: gooseTint(goose),
                border: goose.alive ? "2px solid rgba(12, 12, 12, 0.8)" : "2px solid rgba(90, 90, 90, 0.9)",
                boxShadow: goose.mood === "mourning" ? "0 0 12px rgba(120,160,255,0.35)" : "0 0 8px rgba(0,0,0,0.35)",
              }}
              aria-hidden
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-wide text-foreground"
              style={{ top: -14 }}
            >
              {goose.name} · {stateLabel[goose.state]}
            </div>
            {goose.pregnant && (
              <div className="absolute -right-1 -top-1 text-[10px]">🥚</div>
            )}
            {goose.eggs && goose.eggs.length > 0 && (
              <div className="absolute -left-2 top-5 text-[9px] text-foreground/90">{goose.eggs.length} eggs</div>
            )}
          </div>
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
