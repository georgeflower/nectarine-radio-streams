import type { VisualizerStyle } from "@/components/Visualizer";

export type BandName = "bass" | "lowMid" | "mid" | "treble";

export type GlobalReactivity = {
  masterIntensity: number; // 0.25 - 2.5
  bandsHz: Record<BandName, [number, number]>;
  beatThreshold: number; // multiplier over rolling avg
  sparkleThreshold: number; // multiplier over rolling avg
};

export type ModeReactivity = {
  bassGain: number;
  midGain: number;
  trebleGain: number;
  motion: number;
  glow: number;
  effects: Record<string, number>;
};

export type ModeReactivityOverride = {
  bassGain?: number;
  midGain?: number;
  trebleGain?: number;
  motion?: number;
  glow?: number;
  effects?: Record<string, number>;
};

export type ReactivitySettings = {
  global: GlobalReactivity;
  perMode: Partial<Record<VisualizerStyle, ModeReactivityOverride>>;
};

export type EffectSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  suffix?: string;
};

export const DEFAULT_GLOBAL: GlobalReactivity = {
  masterIntensity: 1,
  bandsHz: {
    bass: [20, 200],
    lowMid: [200, 500],
    mid: [500, 2000],
    treble: [2000, 16000],
  },
  beatThreshold: 1.35,
  sparkleThreshold: 1.7,
};

export const DEFAULT_MODE_BASE = {
  bassGain: 1,
  midGain: 1,
  trebleGain: 1,
  motion: 1,
  glow: 1,
};

export const MODE_BASE_OVERRIDES: Partial<Record<VisualizerStyle, Partial<typeof DEFAULT_MODE_BASE>>> = {
  tunnel: { bassGain: 0.5, motion: 0.35, glow: 0.7 },
};

const modeBaseFor = (style: VisualizerStyle) => ({
  ...DEFAULT_MODE_BASE,
  ...(MODE_BASE_OVERRIDES[style] ?? {}),
});

export const MODE_EFFECT_SPECS: Partial<Record<VisualizerStyle, EffectSpec[]>> = {
  starfield: [
    { key: "starDensity", label: "Star density", min: 0.25, max: 2, step: 0.05, default: 0.5, suffix: "x" },
    { key: "cometBeat", label: "Comets per beat", min: 0, max: 3, step: 0.05, default: 0.2, suffix: "x" },
    { key: "cometRate", label: "Ambient comet rate", min: 0, max: 3, step: 0.05, default: 0.25, suffix: "x" },
    { key: "sparkleDensity", label: "Sparkle density", min: 0, max: 3, step: 0.05, default: 0.3, suffix: "x" },
    { key: "sparkleThresh", label: "Sparkle sensitivity", min: 0.6, max: 1.6, step: 0.05, default: 0.7, suffix: "x" },
  ],
  bars: [
    { key: "barCount", label: "Bar count", min: 0.5, max: 1.7, step: 0.05, default: 1, suffix: "x" },
    { key: "decay", label: "Bar decay / trail", min: 0.05, max: 0.6, step: 0.01, default: 0.2 },
    { key: "hueSpread", label: "Hue spread", min: 0, max: 2, step: 0.05, default: 1, suffix: "x" },
  ],
  plasma: [
    { key: "cellSize", label: "Cell size", min: 0.5, max: 2.5, step: 0.05, default: 1, suffix: "x" },
    { key: "colorSpeed", label: "Color speed", min: 0.25, max: 3, step: 0.05, default: 1, suffix: "x" },
    { key: "complexity", label: "Wave complexity", min: 0.3, max: 1.7, step: 0.05, default: 1, suffix: "x" },
  ],
  oscilloscope: [
    { key: "thickness", label: "Line thickness", min: 0.3, max: 3, step: 0.05, default: 1, suffix: "x" },
    { key: "amplitude", label: "Wave amplitude", min: 0.3, max: 3, step: 0.05, default: 1, suffix: "x" },
    { key: "trail", label: "Trail persistence", min: 0.05, max: 0.6, step: 0.01, default: 0.22 },
  ],
  tunnel: [
    { key: "sliceMult", label: "Slice count", min: 0.4, max: 1.8, step: 0.05, default: 1.35, suffix: "x" },
    { key: "sides", label: "Sides", min: 4, max: 16, step: 1, default: 8 },
    { key: "curve", label: "Curve amount", min: 0, max: 2, step: 0.05, default: 0.55, suffix: "x" },
    { key: "twist", label: "Twist amount", min: 0, max: 2, step: 0.05, default: 1, suffix: "x" },
  ],
  rings: [
    { key: "bins", label: "Ray count", min: 0.5, max: 1.7, step: 0.05, default: 1, suffix: "x" },
    { key: "length", label: "Ray length", min: 0.3, max: 2, step: 0.05, default: 1, suffix: "x" },
    { key: "speed", label: "Rotation speed", min: 0, max: 3, step: 0.05, default: 1, suffix: "x" },
  ],
  particles: [
    { key: "kick", label: "Beat kick", min: 0, max: 3, step: 0.05, default: 1, suffix: "x" },
    { key: "friction", label: "Friction", min: 0.9, max: 0.995, step: 0.005, default: 0.96 },
    { key: "count", label: "Particle count", min: 0.3, max: 2, step: 0.05, default: 1, suffix: "x" },
  ],
};

export const DEFAULT_MODE: ModeReactivity = {
  ...DEFAULT_MODE_BASE,
  effects: {},
};

export const DEFAULT_SETTINGS: ReactivitySettings = {
  global: { ...DEFAULT_GLOBAL, bandsHz: { ...DEFAULT_GLOBAL.bandsHz } },
  perMode: {},
};

export const TUNABLE_STYLES: VisualizerStyle[] = [
  "starfield",
  "bars",
  "plasma",
  "oscilloscope",
  "tunnel",
  "rings",
  "particles",
];

const buildDefaultEffects = (style: VisualizerStyle): Record<string, number> => {
  const specs = MODE_EFFECT_SPECS[style] ?? [];
  const out: Record<string, number> = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
};

export const resolveMode = (
  style: VisualizerStyle,
  settings: ReactivitySettings,
): ModeReactivity => {
  const over = settings.perMode[style] ?? {};
  const effDefaults = buildDefaultEffects(style);
  return {
    bassGain: over.bassGain ?? DEFAULT_MODE_BASE.bassGain,
    midGain: over.midGain ?? DEFAULT_MODE_BASE.midGain,
    trebleGain: over.trebleGain ?? DEFAULT_MODE_BASE.trebleGain,
    motion: over.motion ?? DEFAULT_MODE_BASE.motion,
    glow: over.glow ?? DEFAULT_MODE_BASE.glow,
    effects: { ...effDefaults, ...(over.effects ?? {}) },
  };
};

const STORAGE_KEY = "demo.reactivity.v1";

const clone = (s: ReactivitySettings): ReactivitySettings => ({
  global: {
    ...s.global,
    bandsHz: {
      bass: [...s.global.bandsHz.bass] as [number, number],
      lowMid: [...s.global.bandsHz.lowMid] as [number, number],
      mid: [...s.global.bandsHz.mid] as [number, number],
      treble: [...s.global.bandsHz.treble] as [number, number],
    },
  },
  perMode: Object.fromEntries(
    Object.entries(s.perMode).map(([k, v]) => [
      k,
      { ...v, effects: v?.effects ? { ...v.effects } : undefined },
    ]),
  ) as ReactivitySettings["perMode"],
});

const load = (): ReactivitySettings => {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return clone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      global: {
        masterIntensity: Number(parsed?.global?.masterIntensity) || DEFAULT_GLOBAL.masterIntensity,
        bandsHz: {
          bass: parsed?.global?.bandsHz?.bass ?? DEFAULT_GLOBAL.bandsHz.bass,
          lowMid: parsed?.global?.bandsHz?.lowMid ?? DEFAULT_GLOBAL.bandsHz.lowMid,
          mid: parsed?.global?.bandsHz?.mid ?? DEFAULT_GLOBAL.bandsHz.mid,
          treble: parsed?.global?.bandsHz?.treble ?? DEFAULT_GLOBAL.bandsHz.treble,
        },
        beatThreshold: Number(parsed?.global?.beatThreshold) || DEFAULT_GLOBAL.beatThreshold,
        sparkleThreshold: Number(parsed?.global?.sparkleThreshold) || DEFAULT_GLOBAL.sparkleThreshold,
      },
      perMode: parsed?.perMode ?? {},
    };
  } catch {
    return clone(DEFAULT_SETTINGS);
  }
};

// --- Store with useSyncExternalStore ---
let state: ReactivitySettings = load();
const listeners = new Set<() => void>();

const persist = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
};

const emit = () => {
  persist();
  listeners.forEach((l) => l());
};

export const reactivityStore = {
  get: (): ReactivitySettings => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  setMaster: (v: number) => {
    state = { ...state, global: { ...state.global, masterIntensity: v } };
    emit();
  },
  setBand: (band: BandName, edge: 0 | 1, hz: number) => {
    const cur = state.global.bandsHz[band];
    const next: [number, number] = [cur[0], cur[1]];
    next[edge] = hz;
    if (next[0] >= next[1]) return; // ignore invalid
    state = {
      ...state,
      global: {
        ...state.global,
        bandsHz: { ...state.global.bandsHz, [band]: next },
      },
    };
    emit();
  },
  setBeatThreshold: (v: number) => {
    state = { ...state, global: { ...state.global, beatThreshold: v } };
    emit();
  },
  setSparkleThreshold: (v: number) => {
    state = { ...state, global: { ...state.global, sparkleThreshold: v } };
    emit();
  },
  setModeField: (
    style: VisualizerStyle,
    field: "bassGain" | "midGain" | "trebleGain" | "motion" | "glow",
    v: number,
  ) => {
    const cur = state.perMode[style] ?? {};
    state = {
      ...state,
      perMode: { ...state.perMode, [style]: { ...cur, [field]: v } },
    };
    emit();
  },
  setModeEffect: (style: VisualizerStyle, key: string, v: number) => {
    const cur = state.perMode[style] ?? {};
    const curEff = cur.effects ?? {};
    state = {
      ...state,
      perMode: {
        ...state.perMode,
        [style]: { ...cur, effects: { ...curEff, [key]: v } },
      },
    };
    emit();
  },
  resetMode: (style: VisualizerStyle) => {
    const next = { ...state.perMode };
    delete next[style];
    state = { ...state, perMode: next };
    emit();
  },
  resetAll: () => {
    state = clone(DEFAULT_SETTINGS);
    emit();
  },
};
