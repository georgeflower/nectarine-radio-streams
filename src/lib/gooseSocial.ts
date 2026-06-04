// Coordinator between the two FlyingGoose instances (white + brown) and
// the BoingBall. Each goose registers an imperative API; the coordinator
// schedules dialogues, ball-play chatter, sleep moments and fly-away
// sequences. The BoingBall publishes its position so the geese can react
// to it.

export type GooseRole = "white" | "brown";

export type GooseAPI = {
  variant: GooseRole;
  // Show a text bubble. Text may contain smiley codes (e.g. ":)") which
  // will be rendered as smiley images inside the bubble.
  say: (text: string, durationMs?: number) => void;
  // Current screen-space position used for coordinated interactions.
  getPosition: () => { x: number; y: number };
  // Toggle "flying away" mode — the goose heads off-screen and stays
  // gone until set back to false.
  setAway: (away: boolean) => void;
  // Steer this goose toward an active chase target while ball-play is on.
  setChaseTarget: (target: { x: number; y: number } | null) => void;
  // Toggle a tiny snack bag attached near the beak.
  setFoodBag: (carrying: boolean) => void;
  // Keep the goose seated on the ground for snack breaks.
  setSitting: (sitting: boolean) => void;
};

const geese = new Map<number, GooseAPI>();
let nextId = 1;

let ballPos: { x: number; y: number } | null = null;
export function setBallPos(p: { x: number; y: number } | null) {
  ballPos = p;
}
export function getBallPos() {
  return ballPos;
}

type BallPlayDirective = {
  chaser: GooseRole;
  bumpToward: { x: number; y: number };
};
let ballPlayDirective: BallPlayDirective | null = null;
let lastBumpEvent: { by: GooseRole; at: number } | null = null;

export function getBallPlayDirective() {
  return ballPlayDirective;
}

export function getGoosePositions() {
  const pair = getPair();
  if (!pair) return null;
  return {
    [pair[0].variant]: pair[0].getPosition(),
    [pair[1].variant]: pair[1].getPosition(),
  } as Record<GooseRole, { x: number; y: number }>;
}

export function reportBallBump(by: GooseRole) {
  lastBumpEvent = { by, at: Date.now() };
}

type Mood = "idle" | "playing" | "sleeping" | "away";
let mood: Mood = "idle";

let lastDialogueAt = 0;
let lastBallPlayAt = 0;
let lastFlyAwayAt = 0;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

const DIALOGUES: string[][] = [
  ["Hi! :)", "Hi friend! :D"],
  ["How are you doing?", "Doing great! And you?", "Wonderful! <3"],
  ["Have you seen Rapture?", "No not yet!", "Keep looking! <3"],
  ["Lovely day to fly :)", "Indeed it is! :D"],
  ["Honk honk!", "Hoooonk! :D"],
  ["You are my best friend", "Aww <3 you too!"],
  ["Wanna race?", "You're on! ;)"],
  ["Look at the stars :O", "So pretty <3"],
  ["I love this song :D", "Me too! :dance:"],
  ["Got any snacks?", "Just grass :P", "Yum! :)"],
];

const PLAY_LINES = [
  "Bump time!",
  "Nudge it! :)",
  "Over here!",
  "Your bump!",
  "Line it up!",
  "Boing! :D",
  "Incoming!",
];
const CHASE_LINES = ["On it!", "After the ball! :D", "Chasing!"];
const RECEIVE_LINES = ["Nice bump! :D", "My turn!", "I got next!"];
// A ball-play session lasts MIN_BALL_PASSES plus up to RANDOM_EXTRA_PASSES
// additional turns so the length varies naturally each time.
const MIN_BALL_PASSES = 6;
const RANDOM_EXTRA_PASSES = 3;

const LONELY_LINES = [
  "I'm so lonely... :(",
  "Where's my goose friend?",
  "I'm hungry!",
  "Come back :(",
  "Hellooo? :|",
  "It's quiet without you...",
];

const SLEEPY_LINES = ["Zzz..", "Zzz...", "..Zzz", "Zzzz~"];
const FOOD_FETCH_LINES = ["Brb, snack run! 🥖", "Off to the bakery!", "Food fetch incoming..."];
const FOOD_RETURN_LINES = ["Got the goods! 🍞", "Snack delivery!", "Dinner is served, flock!"];
const FOOD_EAT_LINES = [
  "Nom nom nom 😋",
  "Best halftime ever",
  "Carb-loading for round two",
  "Munch munch",
  "Refueling the engines",
];
const FOOD_RESUME_LINES = ["Alright, back to the ball!", "Round two, let's bump!"];

const SMILEY_RESPONSES = [":)", ":D", "<3", "Aww :)", "Cute! :D", "Hehe :P", ":lol:"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
function getPair(): [GooseAPI, GooseAPI] | null {
  let a: GooseAPI | undefined;
  let b: GooseAPI | undefined;
  for (const g of geese.values()) {
    if (g.variant === "white" && !a) a = g;
    else if (g.variant === "brown" && !b) b = g;
  }
  return a && b ? [a, b] : null;
}

async function runDialogue(lines: string[]) {
  const pair = getPair();
  if (!pair) return;
  for (let i = 0; i < lines.length; i++) {
    const g = pair[i % 2];
    g.say(lines[i], 2400);
    await wait(2600);
    if (!getPair()) return;
  }
}

async function runBallPlay() {
  const pair = getPair();
  if (!pair) return;
  mood = "playing";
  const waitForExpectedBump = async (expected: GooseRole, timeoutMs: number) => {
    const start = Date.now();
    const marker = lastBumpEvent?.at ?? 0;
    while (Date.now() - start < timeoutMs) {
      if (!getPair()) return false;
      if (lastBumpEvent && lastBumpEvent.at > marker && lastBumpEvent.by === expected) return true;
      await wait(70);
    }
    return false;
  };

  const turns = MIN_BALL_PASSES + Math.floor(Math.random() * RANDOM_EXTRA_PASSES);
  let chaserIdx = Math.random() < 0.5 ? 0 : 1;
  try {
    for (let i = 0; i < turns; i++) {
      const activePair = getPair();
      if (!activePair) break;
      const chaser = activePair[chaserIdx];
      const receiver = activePair[1 - chaserIdx];

      chaser.say(pick(CHASE_LINES), 900);
      await wait(500);
      chaser.say(pick(PLAY_LINES), 900);
      const bumpTimeout = 1700 + Math.random() * 700;
      const bumpStart = Date.now();
      while (Date.now() - bumpStart < bumpTimeout) {
        const latestPair = getPair();
        if (!latestPair) break;
        const latestChaser = latestPair[chaserIdx];
        const latestReceiver = latestPair[1 - chaserIdx];
        const ball = getBallPos();
        latestChaser.setChaseTarget(ball);
        latestReceiver.setChaseTarget(null);
        ballPlayDirective = {
          chaser: latestChaser.variant,
          bumpToward: latestReceiver.getPosition(),
        };
        const bumped = await waitForExpectedBump(latestChaser.variant, 90);
        if (bumped) {
          latestReceiver.say(pick(RECEIVE_LINES), 900);
          chaserIdx = 1 - chaserIdx;
          break;
        }
      }
      await wait(550 + Math.random() * 220);
    }
  } finally {
    ballPlayDirective = null;
    for (const g of geese.values()) g.setChaseTarget(null);
  }

  const pairAfterPlay = getPair();
  if (!pairAfterPlay) {
    mood = "idle";
    return;
  }
  // Wind down + sleep
  mood = "sleeping";
  pairAfterPlay[0].say("Phew! :)", 1800);
  await wait(1600);
  if (getPair()) pairAfterPlay[1].say("Tired now... :sleepy:", 1800);
  await wait(1800);
  // Sleep for a little while — alternating Zzz
  const zzzRounds = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < zzzRounds; i++) {
    if (!getPair()) break;
    pair[i % 2].say(pick(SLEEPY_LINES), 2200);
    await wait(2300);
  }
  mood = "idle";
}

async function runFlyAway() {
  const pair = getPair();
  if (!pair) return;
  mood = "away";
  const whichIdx = Math.random() < 0.5 ? 0 : 1;
  const leaving = pair[whichIdx];
  const staying = pair[1 - whichIdx];
  leaving.say(pick(FOOD_FETCH_LINES), 2400);
  await wait(1400);
  if (!getPair()) {
    mood = "idle";
    return;
  }
  leaving.setAway(true);
  // Lonely partner chatters while the other goose fetches snacks.
  const lonelyRounds = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < lonelyRounds; i++) {
    await wait(3500 + Math.random() * 2500);
    if (!getPair()) break;
    staying.say(pick(LONELY_LINES), 2400);
  }
  await wait(1200);
  leaving.setFoodBag(true);
  leaving.setAway(false);
  await wait(2200);
  if (getPair()) {
    leaving.say(pick(FOOD_RETURN_LINES), 2200);
    await wait(2000);
    if (getPair()) staying.say("Yum, perfect timing! :D", 2200);
  }

  if (getPair()) {
    for (const g of geese.values()) g.setSitting(true);
    await wait(700);
    const rounds = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < rounds; i++) {
      const activePair = getPair();
      if (!activePair) break;
      activePair[i % 2].say(pick(FOOD_EAT_LINES), 2200);
      await wait(2200);
    }
    if (getPair()) {
      for (const g of geese.values()) g.setSitting(false);
      leaving.setFoodBag(false);
      await wait(700);
      const pairAfterSnack = getPair();
      if (pairAfterSnack) pairAfterSnack[0].say(pick(FOOD_RESUME_LINES), 2200);
    }
  }
  mood = "idle";
}

async function step() {
  schedulerTimer = null;
  const pair = getPair();
  const now = Date.now();
  if (pair && mood === "idle") {
    // Priority: fly-away > ball-play > regular chat.
    if (now - lastFlyAwayAt > 240_000 && Math.random() < 0.25) {
      lastFlyAwayAt = now;
      await runFlyAway();
    } else if (ballPos && now - lastBallPlayAt > 180_000) {
      lastBallPlayAt = now;
      await runBallPlay();
    } else if (now - lastDialogueAt > 22_000) {
      lastDialogueAt = now;
      await runDialogue(pick(DIALOGUES));
    }
  }
  if (running) {
    schedulerTimer = setTimeout(step, 2500);
  }
}

function ensureScheduler() {
  if (running) return;
  running = true;
  // Small initial delay so both geese have time to register.
  schedulerTimer = setTimeout(step, 4000);
}

function stopSchedulerIfEmpty() {
  if (geese.size === 0) {
    running = false;
    if (schedulerTimer) {
      clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }
    mood = "idle";
    ballPlayDirective = null;
  }
}

export function registerGoose(api: GooseAPI): () => void {
  const id = nextId++;
  geese.set(id, api);
  ensureScheduler();
  return () => {
    geese.delete(id);
    stopSchedulerIfEmpty();
  };
}

// Called by FlyingGoose whenever it shows a smiley reaction for an
// incoming oneliner. The partner goose chimes in with a cute response.
export function reactToOnelinerSmiley(fromVariant: GooseRole) {
  const pair = getPair();
  if (!pair) return;
  const partner = pair[0].variant === fromVariant ? pair[1] : pair[0];
  setTimeout(() => {
    if (getPair()) partner.say(pick(SMILEY_RESPONSES), 1800);
  }, 1400);
}

export const __testing = {
  runBallPlay,
  runFlyAway,
  registerGooseForTests: (api: GooseAPI) => {
    const id = nextId++;
    geese.set(id, api);
    return () => geese.delete(id);
  },
  resetStateForTests: () => {
    geese.clear();
    nextId = 1;
    ballPos = null;
    ballPlayDirective = null;
    mood = "idle";
    lastDialogueAt = 0;
    lastBallPlayAt = 0;
    lastFlyAwayAt = 0;
    lastBumpEvent = null;
    running = false;
    if (schedulerTimer) {
      clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }
  },
};
