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
};

export type ReactivitySettings = {
  global: GlobalReactivity;
  perMode: Partial<Record<VisualizerStyle, Partial<ModeReactivity>>>;
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

export const DEFAULT_MODE: ModeReactivity = {
  bassGain: 1,
  midGain: 1,
  trebleGain: 1,
  motion: 1,
  glow: 1,
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

export const resolveMode = (
  style: VisualizerStyle,
  settings: ReactivitySettings,
): ModeReactivity => {
  const over = settings.perMode[style] ?? {};
  return {
    bassGain: over.bassGain ?? DEFAULT_MODE.bassGain,
    midGain: over.midGain ?? DEFAULT_MODE.midGain,
    trebleGain: over.trebleGain ?? DEFAULT_MODE.trebleGain,
    motion: over.motion ?? DEFAULT_MODE.motion,
    glow: over.glow ?? DEFAULT_MODE.glow,
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
    Object.entries(s.perMode).map(([k, v]) => [k, { ...v }]),
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
  setModeField: (style: VisualizerStyle, field: keyof ModeReactivity, v: number) => {
    const cur = state.perMode[style] ?? {};
    state = {
      ...state,
      perMode: { ...state.perMode, [style]: { ...cur, [field]: v } },
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
