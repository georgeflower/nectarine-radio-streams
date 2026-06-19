// Scripted goose exchanges:
//   * Amiga/Atari platform banter when a new track starts.
//   * Periodic "Have you seen Rapture?" routine every 10 minutes.
//   * Scream + 60-min cooldown when user "Rapture" posts in the oneliner.
//
// Speaker resolution is injected by gooseSocial.ts so this module stays
// dependency-free of the goose registry plumbing.

export type RaptureSpeaker = {
  sayWhite: (text: string, durationMs?: number) => void;
  sayBrown: (text: string, durationMs?: number) => void;
  hasPair: () => boolean;
};

let speaker: RaptureSpeaker | null = null;
export function configureRaptureSpeaker(next: RaptureSpeaker | null) {
  speaker = next;
}

// ---------- Amiga / Atari track banter ----------

type PlatformKind = "amiga" | "atari" | null;
function classify(platform: string | undefined | null): PlatformKind {
  const p = (platform || "").toLowerCase();
  if (p.includes("amiga")) return "amiga";
  if (p.includes("atari")) return "atari";
  return null;
}

let lastTrackKey = "";
let lastFiredPlatform: PlatformKind = null;
let consecutiveCount = 0;
let lastPlatformExchangeAt = 0;

export function notePlatformChange(platform: string | undefined | null, trackKey: string) {
  const kind = classify(platform);
  if (!kind) return;
  const key = `${trackKey}|${kind}`;
  if (key === lastTrackKey) return;
  lastTrackKey = key;

  if (kind === lastFiredPlatform) {
    consecutiveCount += 1;
  } else {
    consecutiveCount = 1;
    lastFiredPlatform = kind;
  }
  // Skip every 2nd in a row of the same platform.
  if (consecutiveCount % 2 === 0) return;
  if (!speaker || !speaker.hasPair()) return;

  lastPlatformExchangeAt = Date.now();
  if (kind === "amiga") {
    speaker.sayWhite("AMIGAAAAAA!", 2400);
    setTimeout(() => speaker?.sayBrown("ATARIIIII!", 2400), 1400);
  } else {
    speaker.sayBrown("ATARIIIII!", 2400);
    setTimeout(() => speaker?.sayWhite("AMIGAAAAAA!", 2400), 1400);
  }
}

export function getLastPlatformExchangeAt() {
  return lastPlatformExchangeAt;
}

// ---------- 10-minute "Have you seen Rapture?" routine ----------

const RAPTURE_INTERVAL_MS = 10 * 60_000;
const RAPTURE_COOLDOWN_MS = 60 * 60_000;
const POST_ONELINER_SUPPRESS_MS = 2 * 60_000;

let intervalTimer: ReturnType<typeof setInterval> | null = null;
let lastRaptureOnelinerAt = 0;

function playSeenRaptureRoutine() {
  if (!speaker || !speaker.hasPair()) return;
  const now = Date.now();
  // Don't ask right after Rapture spoke.
  if (now - lastRaptureOnelinerAt < RAPTURE_COOLDOWN_MS) return;
  speaker.sayWhite("Have you seen Rapture?", 2600);
  setTimeout(() => speaker?.sayBrown("No :(", 2200), 1600);
  setTimeout(() => speaker?.sayWhite("keep looking!", 2400), 3200);
}

export function startRaptureRoutine() {
  if (intervalTimer) return;
  intervalTimer = setInterval(playSeenRaptureRoutine, RAPTURE_INTERVAL_MS);
}

export function stopRaptureRoutine() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}

// ---------- Rapture oneliner reaction ----------

export function noteRaptureOnelinerIfMatch(username: string | undefined | null) {
  if (!username) return;
  if (!/^rapture$/i.test(username.trim())) return;
  const now = Date.now();
  if (now - lastRaptureOnelinerAt < RAPTURE_COOLDOWN_MS) return;
  if (!speaker || !speaker.hasPair()) return;
  lastRaptureOnelinerAt = now;
  speaker.sayWhite("Rapture! <3", 2600);
  setTimeout(() => speaker?.sayBrown("Daddy!", 2200), 800);
  setTimeout(() => speaker?.sayWhite("Mommy!", 2200), 1600);
}

export const __testing = {
  reset: () => {
    lastTrackKey = "";
    lastFiredPlatform = null;
    consecutiveCount = 0;
    lastPlatformExchangeAt = 0;
    lastRaptureOnelinerAt = 0;
    stopRaptureRoutine();
  },
  playSeenRaptureRoutine,
  getLastRaptureOnelinerAt: () => lastRaptureOnelinerAt,
  RAPTURE_INTERVAL_MS,
  RAPTURE_COOLDOWN_MS,
  POST_ONELINER_SUPPRESS_MS,
};
