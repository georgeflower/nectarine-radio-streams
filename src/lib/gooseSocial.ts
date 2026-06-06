// Coordinator between the two FlyingGoose instances (white + brown) and
// the BoingBall. Each goose registers an imperative API; the coordinator
// schedules dialogues, ball-play chatter, sleep moments and fly-away
// sequences. The BoingBall publishes its position so the geese can react
// to it.

import {
  buildBirdUtterance,
  deriveOnelinerMood,
  learnLexiconFromOneliner,
  type LexiconMood,
} from "@/lib/gooseLearnedLexicon";
import { findLearnedTrigger, pickLearnedPhrase } from "@/lib/gooseLearnedPhrases";
import { queueOnelinerForCloud } from "@/lib/gooseLexiconCloud";
import type { GooseSceneEra } from "@/lib/gooseSceneEra";
import { GOOSE_DIALOGUES } from "@/lib/gooseDialogues";

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
  // Marks that this goose is in a food-fetch mission and should not re-perch.
  setFetchingFood: (fetching: boolean) => void;
  // Toggle "ball-play is currently active" — while true, the goose must
  // stay airborne and skip routine/tiredness perching.
  setBallPlayActive: (active: boolean) => void;
};

const geese = new Map<number, GooseAPI>();
let nextId = 1;

let ballPos: { x: number; y: number } | null = null;
export function setBallPos(p: { x: number; y: number } | null) {
  ballPos = p;
}
let lowFpsPerformance = false;
export function setGoosePerformanceState(next: { lowFps: boolean }) {
  lowFpsPerformance = next.lowFps;
}

function buildContextualDialogue(now: number): string[] {
  if (lowFpsPerformance) {
    return pickUsageTracked("low-fps-dialogues", LOW_FPS_DIALOGUES);
  }
  if (!recentOneliner || now - recentOneliner.at > RECENT_ONELINER_WINDOW_MS) {
    return pickUsageTracked("idle-dialogues", IDLE_DIALOGUE_FALLBACKS);
  }
  const user = recentOneliner.username || "someone";
  const triggered = findLearnedTrigger(recentOneliner.text);
  if (triggered) {
    return [`${user} triggered: "${triggered}"`, "Echo lock engaged. Confirmasse!"];
  }
  const mood = applyEraMood(deriveOnelinerMood(recentOnelinerTrail), sceneEra);
  const lexiconLine = buildBirdUtterance({ mood, maxLen: 34 });
  if (lexiconLine) {
    return [`${user} vibe: ${lexiconLine}`, pickUsageTracked("lexicon-dialogue-lines", LEXICON_DIALOGUE_LINES)];
  }
  // Keep learned whole-phrase replay as a fallback after lexicon synthesis.
  const learned = pickLearnedPhrase();
  if (learned) return [`${user} just unlocked: "${learned}"`, "Chatline certified. Confirmasse!"];
  const line = recentOneliner.text.length > 56 ? `${recentOneliner.text.slice(0, 53)}...` : recentOneliner.text;
  return pickUsageTracked("oneliner-dialogues", ONELINER_DIALOGUES).map((entry) =>
    entry.replace(/\{user\}/g, user).replace(/\{line\}/g, line),
  );
}
export function getBallPos() {
  return ballPos;
}

export function noteRecentOneliner(username: string, text: string) {
  const clean = text.trim();
  if (!clean) return;
  // Keep only the latest line so chatter reacts to what just happened on screen.
  recentOneliner = { username, text: clean, at: Date.now() };
  recentOnelinerTrail.push({ username, text: clean });
  while (recentOnelinerTrail.length > MAX_ONELINER_TRAIL) recentOnelinerTrail.shift();
  learnLexiconFromOneliner(clean, username);
  queueOnelinerForCloud(clean);
}

let sceneEra: GooseSceneEra = "intro";
export function setGooseSceneEra(nextEra: GooseSceneEra) {
  sceneEra = nextEra;
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

// Family event bus — used by GooseFamily to know when the adults are
// sitting together on a snack break so it can lay/hatch eggs.
export type FamilyEvent =
  | { type: "snack-start"; positions: Record<GooseRole, { x: number; y: number }> | null }
  | { type: "snack-end" };
type FamilyListener = (event: FamilyEvent) => void;
const familyListeners = new Set<FamilyListener>();
export function subscribeFamilyEvents(listener: FamilyListener) {
  familyListeners.add(listener);
  return () => familyListeners.delete(listener);
}
export function emitFamilyEvent(event: FamilyEvent) {
  for (const l of familyListeners) {
    try { l(event); } catch { /* ignore listener errors */ }
  }
}

type Mood = "idle" | "playing" | "sleeping" | "away";
let mood: Mood = "idle";

let lastDialogueAt = 0;
let lastBallPlayAt = 0;
let lastFlyAwayAt = 0;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let recentOneliner: { username: string; text: string; at: number } | null = null;
let recentOnelinerTrail: Array<{ username?: string; text: string }> = [];
const dialogueUsage = new Map<string, number[]>();
const MAX_ONELINER_TRAIL = 14;

// Prefer chat tied to recent oneliners (85s), then fall back to ambient banter.
const RECENT_ONELINER_WINDOW_MS = 85_000;
// Minimum gap between contextual goose dialogues (70s).
const DIALOGUE_COOLDOWN_MS = 70_000;
const BALL_PLAY_COOLDOWN_MS = 180_000;
// Snack-break interval: at least 9 minutes between feedings.
const FLY_AWAY_COOLDOWN_MS = 540_000;
const FLY_AWAY_CHANCE = 0.15;

const DIALOGUE_COOLDOWN_BY_ERA: Record<GooseSceneEra, number> = {
  intro: DIALOGUE_COOLDOWN_MS,
  // Gradual cooldown reduction (~11-34%) so later eras feel livelier without spam.
  warmed: 62_000,
  party: 54_000,
  veteran: 46_000,
};
const LEXICON_DIALOGUE_LINES = [
  "Local lexicon synced.",
  "Scene mood sampled.",
  "Shortline style loaded.",
  "Browser chatter calibrated.",
];
const ERA_MOOD_OVERRIDES: Partial<Record<GooseSceneEra, Partial<Record<LexiconMood, LexiconMood>>>> = {
  party: { calm: "hype" },
  veteran: { calm: "chaotic", friendly: "chaotic" },
};
const ONELINER_DIALOGUES: string[][] = [
  ['"{line}" from {user}? Confirmasse!', "Scene approved. :D"],
  ["{user} dropped fire in oneliner", "Reset the counters, this is elite!"],
  ["Did you see {user}'s line?", "He-Man level power phrase!"],
  ["glob glob... {user} speaks", "The raster bars glow brighter!"],
  ["Jogeir is GOD, says {user}", "And the crowd goes wild!"],
  ["{user} just spawned a cracktro quote", "Booting goose hype mode."],
  ["That oneliner from {user} slaps", "Paula channels at maximum!"],
  ["{user} typed pure copper bars", "Vibes set to 50Hz magic."],
  ['"{line}"', "That's a keeper, no doubt."],
  ["Scene meter after {user}: 100%", "No notes. Just honks."],
  ["{user} just made the demo gods smile", "Respect and raster love."],
];
const IDLE_DIALOGUE_FALLBACKS: string[][] = GOOSE_DIALOGUES;
const LOW_FPS_DIALOGUES: string[][] = [
  ["Yo... this is a SLOW PC with a bad GPU :( :(", "We can hear every dropped frame."],
  ["Scroller lag detected — bad GPU vibes today. :(", "We'll keep honking through the stutter!"],
  ["SLOW PC alert! bad GPU mood activated. :( :(", "Still scene forever, even at low FPS."],
];

const ONELINER_REACTION_RESPONSES = [
  ":)",
  ":D",
  "<3",
  "Aww :)",
  "Cute! :D",
  "Hehe :P",
  ":lol:",
  "Confirmasse!",
  "He-Man!",
  "glob glob!",
  "Jogeir is GOD!",
  "Scene spirit detected!",
  "Cracktro energy!",
  "Copperbars forever!",
  "Raster love!",
  "BOOM tsk!",
  "Pixel power!",
  "Mod vibes!",
  "Tracker wizardry!",
  "Paula is purring!",
  "Amiga dreams!",
  "C64 swagger!",
  "No carrier? No problem!",
  "Disk swap champion!",
  "Greetings to all swappers!",
  "Party mode: ON",
  "Epic scrolltext moment!",
  "Blitter goes brrr!",
  "DMA all the way!",
  "Fullscreen plasma!",
  "Sine scroller unlocked!",
  "VIC-II approved!",
  "SID bassline incoming!",
  "Chip tune goose!",
  "Hard sync happiness!",
  "Overscan deluxe!",
  "Lamer detected? denied!",
  "Elite vibes only!",
  "Respect to the coders!",
  "Greetings to all groups!",
  "One more reboot! :)",
  "Turbo honk enabled!",
  "Scanlines and sunshine!",
  "Phat beats in memory!",
  "BBS nostalgia attack!",
  "Handle with hex!",
  "Zero bugs, only style!",
  "Intro magic at 4k!",
  "Bootblock baller!",
  "Floppy spin symphony!",
  "Assembler poetry!",
  "Nerd mode supreme!",
  "Demoscene forever!",
  "See you at the compo!",
  "Legendary one-liner!",
  "Pixelated perfection!",
  "Goose says: send it!",
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
const BUMP_TIMEOUT_BASE_MS = 1700;
const BUMP_TIMEOUT_RANDOM_MS = 700;
const BUMP_CHECK_INTERVAL_MS = 90;

const LONELY_LINES = [
  "I'm so lonely... :(",
  "Where's my goose friend?",
  "I'm hungry!",
  "Come back :(",
  "Hellooo? :|",
  "It's quiet without you...",
  "I miss the snack scout already",
  "Come back with croissants! :(",
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
  "This baguette has boss music",
  "Crunch level: MAXIMUM",
];
const FOOD_RESUME_LINES = ["Alright, back to the ball!", "Round two, let's bump!"];

// Large chatter pool (~500 lines) drawn from the demoscene dialogue set.
// Used for in-between banter during ball-play wind-down and snack breaks
// so the geese never feel like they're repeating the same handful of lines.
const CHATTER_POOL: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pair of GOOSE_DIALOGUES) {
    for (const line of pair) {
      const clean = (line ?? "").trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
      if (out.length >= 500) return out;
    }
  }
  return out;
})();


function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickUsageTracked<T>(bucket: string, arr: readonly T[]): T {
  const counts = dialogueUsage.get(bucket);
  const nextCounts = counts && counts.length === arr.length
    ? counts
    : Array.from({ length: arr.length }, () => 0);
  dialogueUsage.set(bucket, nextCounts);

  const maxCount = nextCounts.reduce((highest, count) => Math.max(highest, count), 0);
  const weights = nextCounts.map((count) => maxCount + 1 - count);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = Math.random() * totalWeight;
  let selectedIndex = weights.length - 1;
  for (let i = 0; i < weights.length; i++) {
    threshold -= weights[i];
    if (threshold <= 0) {
      selectedIndex = i;
      break;
    }
  }
  nextCounts[selectedIndex] += 1;
  return arr[selectedIndex];
}
function applyEraMood(mood: LexiconMood, era: GooseSceneEra): LexiconMood {
  return ERA_MOOD_OVERRIDES[era]?.[mood] ?? mood;
}
function getDialogueCooldownMs() {
  return DIALOGUE_COOLDOWN_BY_ERA[sceneEra] ?? DIALOGUE_COOLDOWN_MS;
}
function canStartBallPlay(now: number) {
  return ballPos !== null && now - lastBallPlayAt >= BALL_PLAY_COOLDOWN_MS;
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

function clearBallPlayState() {
  ballPlayDirective = null;
  for (const g of geese.values()) g.setChaseTarget(null);
}

function clearFlyAwayState() {
  for (const g of geese.values()) {
    g.setAway(false);
    g.setFoodBag(false);
    g.setSitting(false);
    g.setFetchingFood(false);
  }
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
  // Ensure neither goose is sitting when play begins.
  pair[0].setSitting(false);
  pair[1].setSitting(false);
  pair[0].setBallPlayActive(true);
  pair[1].setBallPlayActive(true);
  const bumpedSince = (expectedBumper: GooseRole, marker: number) =>
    !!lastBumpEvent && lastBumpEvent.by === expectedBumper && lastBumpEvent.at > marker;

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
      const maxBumpDuration = BUMP_TIMEOUT_BASE_MS + Math.random() * BUMP_TIMEOUT_RANDOM_MS;
      const bumpStart = Date.now();
      const bumpMarker = lastBumpEvent?.at ?? 0;
      while (Date.now() - bumpStart < maxBumpDuration) {
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
        if (bumpedSince(latestChaser.variant, bumpMarker)) {
          latestReceiver.say(pick(RECEIVE_LINES), 900);
          chaserIdx = 1 - chaserIdx;
          break;
        }
        await wait(BUMP_CHECK_INTERVAL_MS);
      }
      clearBallPlayState();
      await wait(550 + Math.random() * 220);
    }
  } finally {
    clearBallPlayState();
    for (const g of geese.values()) g.setBallPlayActive(false);
  }

  const pairAfterPlay = getPair();
  if (!pairAfterPlay) {
    mood = "idle";
    return;
  }
  // Wind down with extra chatter pulled from the 500-line pool.
  mood = "sleeping";
  pairAfterPlay[0].say("Phew! :)", 1800);
  await wait(1600);
  if (getPair()) pairAfterPlay[1].say("Tired now... :sleepy:", 1800);
  await wait(1800);
  const chatterRounds = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < chatterRounds; i++) {
    const activePair = getPair();
    if (!activePair) break;
    activePair[i % 2].say(pickUsageTracked("chatter-pool", CHATTER_POOL), 2200);
    await wait(2400);
  }
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
  try {
    leaving.setFetchingFood(true);
    leaving.say(pick(FOOD_FETCH_LINES), 2400);
    await wait(1400);
    if (!getPair()) return;
    leaving.setAway(true);
    // Lonely partner chatters while the other goose fetches snacks.
    const lonelyRounds = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < lonelyRounds; i++) {
      await wait(3500 + Math.random() * 2500);
      if (!getPair()) break;
      staying.say(pick(LONELY_LINES), 2400);
    }
    await wait(1200);
    leaving.setAway(false);
    await wait(320);
    leaving.setFoodBag(true);
    leaving.setFetchingFood(false);
    await wait(2200);
    if (getPair()) {
      leaving.say(pick(FOOD_RETURN_LINES), 2200);
      await wait(2000);
      if (getPair()) staying.say("Yum, perfect timing! :D", 2200);
    }

    if (getPair()) {
      for (const g of geese.values()) g.setSitting(true);
      await wait(1200); // let them fly to a perch and settle
      emitFamilyEvent({ type: "snack-start", positions: getGoosePositions() });
      const eatStart = Date.now();
      const MIN_EAT_MS = 35_000;
      let i = 0;
      while (Date.now() - eatStart < MIN_EAT_MS) {
        const activePair = getPair();
        if (!activePair) break;
        // Alternate between snack-specific lines and the broader chatter pool
        // so the snack break feels more like a real conversation.
        const line = i % 2 === 0
          ? pick(FOOD_EAT_LINES)
          : pickUsageTracked("chatter-pool", CHATTER_POOL);
        activePair[i % 2].say(line, 2200);
        i++;
        await wait(2400);
      }
      if (getPair()) {
        await wait(700);
        const pairAfterSnack = getPair();
        if (pairAfterSnack) pairAfterSnack[0].say(pick(FOOD_RESUME_LINES), 2200);
      }
      emitFamilyEvent({ type: "snack-end" });
    }


  } finally {
    clearFlyAwayState();
    mood = "idle";
  }
}

async function step() {
  schedulerTimer = null;
  const pair = getPair();
  const now = Date.now();
  if (pair && mood === "idle") {
    // Priority: fly-away > ball-play > regular chat.
    if (now - lastFlyAwayAt > FLY_AWAY_COOLDOWN_MS && Math.random() < FLY_AWAY_CHANCE) {
      lastFlyAwayAt = now;
      await runFlyAway();
    } else if (canStartBallPlay(now)) {
      try {
        await runBallPlay();
      } finally {
        lastBallPlayAt = Date.now();
      }
    } else if (now - lastDialogueAt > getDialogueCooldownMs()) {
      const dialogue = buildContextualDialogue(now);
      if (dialogue.length) {
        lastDialogueAt = now;
        await runDialogue(dialogue);
      }
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
    if (getPair()) partner.say(pick(ONELINER_REACTION_RESPONSES), 1800);
  }, 1400);
}

// Make a random registered goose say a line (used for song-rating chatter
// triggered when the now-playing track changes).
export function sayFromAnyGoose(text: string, durationMs = 2400) {
  const all = Array.from(geese.values());
  if (all.length === 0) return;
  const speaker = all[Math.floor(Math.random() * all.length)];
  speaker.say(text, durationMs);
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
    recentOneliner = null;
    recentOnelinerTrail = [];
    dialogueUsage.clear();
    sceneEra = "intro";
    lowFpsPerformance = false;
    running = false;
    if (schedulerTimer) {
      clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }
  },
  buildContextualDialogueForTests: buildContextualDialogue,
  canStartBallPlayForTests: canStartBallPlay,
  getBallPlayCooldownMsForTests: () => BALL_PLAY_COOLDOWN_MS,
  getLastBallPlayAtForTests: () => lastBallPlayAt,
  getOnelinerReactionResponsesForTests: () => [...ONELINER_REACTION_RESPONSES],
  pickUsageTrackedForTests: <T,>(bucket: string, options: readonly T[]) => pickUsageTracked(bucket, options),
  setLastBallPlayAtForTests: (at: number) => {
    lastBallPlayAt = at;
  },
  stepForTests: step,
};
