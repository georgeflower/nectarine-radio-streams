// Shared state for the Amiga Boing ball so other components (e.g. FlyingGoose)
// can read its position and apply kicks.

type BallState = {
  mounted: boolean;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  pendingKick: { vx: number; vy: number } | null;
};

export const boingBall: BallState = {
  mounted: false,
  x: 0,
  y: 0,
  r: 0,
  vx: 0,
  vy: 0,
  pendingKick: null,
};

export function kickBoingBall(vx: number, vy: number) {
  boingBall.pendingKick = { vx, vy };
}
