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
};

const geese = new Map<number, GooseAPI>();
let nextId = 1;

let ballPos: { x: number; y: number } | null = null;
let gooseBallPos: { x: number; y: number } | null = null;
export function setBallPos(p: { x: number; y: number } | null) {
  ballPos = p;
}
export function getBallPos() {
  return ballPos;
}
export function setGooseBallPos(p: { x: number; y: number } | null) {
  gooseBallPos = p;
}
export function getGooseBallPos() {
  return gooseBallPos;
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
  "Pass it!",
  "Catch! :)",
  "Over here!",
  "Your turn!",
  "Heads up!",
  "Boing! :D",
  "Incoming!",
];
const HOLD_LINES = ["My turn!", "Ready!", "Here we go!"];
const RECEIVE_LINES = ["Got it! :D", "Nice one!", "Caught it!"];
const BALL_PASS_MIN_ARC_HEIGHT = 28;

const LONELY_LINES = [
  "I'm so lonely... :(",
  "Where's my goose friend?",
  "I'm hungry!",
  "Come back :(",
  "Hellooo? :|",
  "It's quiet without you...",
];

const SLEEPY_LINES = ["Zzz..", "Zzz...", "..Zzz", "Zzzz~"];
const BYE_LINES = ["See ya laterz!", "GtG!", "Bye bye! :)", "Catch ya later!"];

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
  const animateBallPass = async (from: GooseAPI, to: GooseAPI, durationMs: number) => {
    const start = from.getPosition();
    const end = to.getPosition();
    // Higher/lower arc based on horizontal throw distance.
    const lift = Math.max(BALL_PASS_MIN_ARC_HEIGHT, Math.abs(end.x - start.x) * 0.12);
    const startAt = Date.now();
    while (true) {
      const t = Math.min(1, (Date.now() - startAt) / durationMs);
      setGooseBallPos({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t - Math.sin(Math.PI * t) * lift,
      });
      if (t >= 1) return true;
      await wait(16);
      if (!getPair()) return false;
    }
  };

  const turns = 6 + Math.floor(Math.random() * 3);
  let holderIdx = Math.random() < 0.5 ? 0 : 1;
  try {
    setGooseBallPos(pair[holderIdx].getPosition());
    for (let i = 0; i < turns; i++) {
      const activePair = getPair();
      if (!activePair) break;
      const holder = activePair[holderIdx];
      const receiver = activePair[1 - holderIdx];

      setGooseBallPos(holder.getPosition());
      holder.say(pick(HOLD_LINES), 900);
      await wait(700);

      holder.say(pick(PLAY_LINES), 900);
      const moved = await animateBallPass(holder, receiver, 850 + Math.random() * 250);
      if (!moved) break;

      receiver.say(pick(RECEIVE_LINES), 900);
      holderIdx = 1 - holderIdx;
      await wait(550 + Math.random() * 220);
    }
  } finally {
    setGooseBallPos(null);
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
  leaving.say(pick(BYE_LINES), 2400);
  await wait(1400);
  if (!getPair()) {
    mood = "idle";
    return;
  }
  leaving.setAway(true);
  // Lonely partner chatters for ~20-30 seconds
  const lonelyRounds = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < lonelyRounds; i++) {
    await wait(3500 + Math.random() * 2500);
    if (!getPair()) break;
    staying.say(pick(LONELY_LINES), 2400);
  }
  await wait(2500);
  leaving.setAway(false);
  await wait(2200);
  if (getPair()) {
    staying.say("You're back! <3", 2200);
    await wait(2000);
    if (getPair()) leaving.say("Missed you! :)", 2200);
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
    setGooseBallPos(null);
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
