// Fire-and-forget station play logging. Nothing here may throw or reject into
// the render/playback path.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// The queue endpoint is polled every 30s; without this a single track would
// post a dozen times and lean entirely on the server-side conflict.
let lastLoggedKey: string | null = null;

export type SongPlayInput = {
  songId: string;
  // Raw upstream string — never normalised client-side, or per-client timezone
  // interpretation would break the (song_id, playstart) dedup.
  playstart: string;
  lengthSec?: number | null;
  requester?: string | null;
};

export const logSongPlay = ({ songId, playstart, lengthSec, requester }: SongPlayInput): void => {
  try {
    if (!songId || !playstart) return;
    const key = `${songId}|${playstart}`;
    if (key === lastLoggedKey) return;
    lastLoggedKey = key;

    void fetch(`${SUPABASE_URL}/functions/v1/song-play`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        song_id: songId,
        playstart,
        length_sec: lengthSec ?? null,
        requester: requester ?? null,
      }),
    }).catch(() => {
      /* drop silently */
    });
  } catch {
    /* logging must never affect playback */
  }
};

// Song metadata enrichment. Same fire-and-forget contract as logSongPlay.
// Map (not Set) so a long-lived session re-ingests once the DB row goes stale.
const ingested = new Map<string, number>();
const INGEST_TTL_MS = 6 * 60 * 60 * 1000;

export const ingestSong = (songId: string, doc: unknown): void => {
  try {
    if (!songId || !doc) return;
    const last = ingested.get(songId);
    if (last !== undefined && Date.now() - last < INGEST_TTL_MS) return;
    ingested.set(songId, Date.now());


    void fetch(`${SUPABASE_URL}/functions/v1/song-ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ song_id: songId, doc }),
    }).catch(() => {
      /* drop silently */
    });
  } catch {
    /* enrichment must never affect the read path */
  }
};
