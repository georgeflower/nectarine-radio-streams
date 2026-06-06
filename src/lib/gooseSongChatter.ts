// Phrase pools that the geese use to chat about the currently playing
// song, picked based on the track's user rating (0-5).

export type RatingTier = "banger" | "solid" | "meh" | "rough";

const BANGER_LINES = [
  "Great song! :D",
  "High score!",
  "What a banger!",
  "Crank it up!",
  "This SLAPS!",
  "Add to favs!",
  "Five star vibes!",
  "Scene perfection!",
];
const SOLID_LINES = [
  "Nice tune by {artist}",
  "Decent track from {artist}",
  "{artist} is cooking",
  "Pretty good!",
  "I'd replay this",
  "Solid 3-star vibe",
  "Honk of approval",
  "{artist} keeps it tight",
];
const MEH_LINES = [
  "So low score, why?",
  "I think I like this... or do I?",
  "Not my favorite",
  "Mid, honestly",
  "Skip-adjacent",
  "{artist}, you can do better",
  "Eh, kinda whatever",
  "It's... okay?",
];
const ROUGH_LINES = [
  "OMG, low score! :(",
  "My ears are bleeding",
  "My taste differs — I kinda like it!",
  "Who approved this?",
  "Send help",
  "Cursed BPM",
  "How dare you {artist}!",
  "Not even ironic-good",
];

export function ratingTier(rating: number | undefined): RatingTier | null {
  if (rating === undefined || !Number.isFinite(rating)) return null;
  if (rating >= 4) return "banger";
  if (rating >= 3) return "solid";
  if (rating >= 2) return "meh";
  return "rough";
}

export function pickRatingLine(rating: number | undefined, artist: string): string | null {
  const tier = ratingTier(rating);
  if (!tier) return null;
  const pool =
    tier === "banger" ? BANGER_LINES
    : tier === "solid" ? SOLID_LINES
    : tier === "meh" ? MEH_LINES
    : ROUGH_LINES;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line.replace(/\{artist\}/g, artist || "the artist");
}
