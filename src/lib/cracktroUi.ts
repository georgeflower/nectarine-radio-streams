// Tiny global stores for cracktro UI:
//   • windowScale  → user-selected size (S/M/L) for FloatingWindow + info box
//   • mourningActive → true while the flock is performing a mourning ritual;
//                      consumed by the scrollers/info box to fade + desaturate.
//   • playerTime    → current elapsed/total from <audio>, displayed in info box.

type Listener = () => void;

// --- windowScale ----------------------------------------------------------
const WINDOW_SCALE_KEY = "cracktro-window-scale";
export type WindowSize = "s" | "m" | "l";
export const WINDOW_SCALE_VALUES: Record<WindowSize, number> = {
  s: 0.8,
  m: 1.0,
  l: 1.25,
};

let _windowSize: WindowSize = (() => {
  try {
    const v = localStorage.getItem(WINDOW_SCALE_KEY) as WindowSize | null;
    if (v === "s" || v === "m" || v === "l") return v;
  } catch { /* ignore */ }
  return "m";
})();
const winListeners = new Set<Listener>();
export function getWindowSize(): WindowSize { return _windowSize; }
export function getWindowScale(): number { return WINDOW_SCALE_VALUES[_windowSize]; }
export function setWindowSize(next: WindowSize) {
  _windowSize = next;
  try { localStorage.setItem(WINDOW_SCALE_KEY, next); } catch { /* ignore */ }
  for (const l of winListeners) { try { l(); } catch { /* ignore */ } }
}
export function subscribeWindowSize(l: Listener) {
  winListeners.add(l);
  return () => { winListeners.delete(l); };
}

// --- mourning -------------------------------------------------------------
let _mourning = false;
const mourningListeners = new Set<Listener>();
export function getMourningActive(): boolean { return _mourning; }
export function setMourningActive(v: boolean) {
  if (_mourning === v) return;
  _mourning = v;
  for (const l of mourningListeners) { try { l(); } catch { /* ignore */ } }
}
export function subscribeMourning(l: Listener) {
  mourningListeners.add(l);
  return () => { mourningListeners.delete(l); };
}

// --- player time ----------------------------------------------------------
let _currentTime = 0;
let _duration = 0;
const timeListeners = new Set<Listener>();
export function setPlayerTime(currentTime: number, duration: number) {
  _currentTime = currentTime;
  _duration = duration;
  for (const l of timeListeners) { try { l(); } catch { /* ignore */ } }
}
export function getPlayerTime() {
  return { currentTime: _currentTime, duration: _duration };
}
export function subscribePlayerTime(l: Listener) {
  timeListeners.add(l);
  return () => { timeListeners.delete(l); };
}
export function formatMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
