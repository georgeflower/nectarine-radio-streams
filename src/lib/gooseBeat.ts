// Tiny shared store for the currently-detected song BPM, so non-React
// renderers (BoingBall canvas) can sync small animations to the beat
// without coupling to the audio analyser.

let bpm = 120;
type Listener = (bpm: number) => void;
const listeners = new Set<Listener>();

export function setBpm(next: number) {
  if (!Number.isFinite(next) || next <= 0) return;
  // Clamp to a sensible range (matches useBpm's detector limits).
  const clamped = Math.max(60, Math.min(200, next));
  if (Math.abs(clamped - bpm) < 0.1) return;
  bpm = clamped;
  for (const l of listeners) {
    try { l(bpm); } catch { /* ignore */ }
  }
}

export function getBpm(): number {
  return bpm;
}

export function subscribeBpm(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// Quarter-note period in ms for the current BPM (4/4 time).
export function getQuarterPeriodMs(): number {
  return 60_000 / bpm;
}
