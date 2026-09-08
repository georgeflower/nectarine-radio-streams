CREATE TABLE public.app_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL CHECK (event IN ('love','unlove','lastfm_login')),
  song_id text,
  session_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.app_events_id_seq TO service_role;
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX app_events_created_at_idx ON public.app_events (created_at);

CREATE TABLE public.digest_runs (
  week_start date PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient text,
  is_test boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.digest_runs TO service_role;
ALTER TABLE public.digest_runs ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.weekly_digest_stats(week_start date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (week_start::timestamp AT TIME ZONE 'Europe/Stockholm') AS cur_from,
    ((week_start + 7)::timestamp AT TIME ZONE 'Europe/Stockholm') AS cur_to,
    ((week_start - 7)::timestamp AT TIME ZONE 'Europe/Stockholm') AS prev_from,
    ((week_start - 21)::timestamp AT TIME ZONE 'Europe/Stockholm') AS trend_from
),
cur_plays AS (
  SELECT * FROM song_plays, bounds WHERE playstart >= cur_from AND playstart < cur_to
),
prev_plays AS (
  SELECT * FROM song_plays, bounds WHERE playstart >= prev_from AND playstart < cur_from
),
top AS (
  SELECT p.song_id, count(*) AS plays,
         coalesce(s.title, 'Song #' || p.song_id) AS title,
         (SELECT string_agg(a.artist_name, ', ' ORDER BY a.position)
            FROM song_artists a WHERE a.song_id = p.song_id) AS artists
  FROM cur_plays p LEFT JOIN songs s ON s.song_id = p.song_id
  GROUP BY p.song_id, s.title ORDER BY plays DESC, p.song_id LIMIT 5
),
busiest AS (
  SELECT to_char((playstart AT TIME ZONE 'Europe/Stockholm')::date, 'Dy DD Mon') AS day, count(*) AS plays
  FROM cur_plays GROUP BY 1 ORDER BY plays DESC LIMIT 1
),
trend AS (
  SELECT wk.ws, (SELECT count(*) FROM song_plays sp
                 WHERE sp.playstart >= (wk.ws::timestamp AT TIME ZONE 'Europe/Stockholm')
                   AND sp.playstart <  ((wk.ws + 7)::timestamp AT TIME ZONE 'Europe/Stockholm')) AS plays
  FROM (SELECT week_start - 21 AS ws UNION ALL SELECT week_start - 14 UNION ALL SELECT week_start - 7 UNION ALL SELECT week_start) wk
  ORDER BY wk.ws
),
ev AS (
  SELECT
    count(*) FILTER (WHERE event = 'love' AND created_at >= cur_from AND created_at < cur_to) AS loves,
    count(*) FILTER (WHERE event = 'unlove' AND created_at >= cur_from AND created_at < cur_to) AS unloves,
    count(*) FILTER (WHERE event = 'lastfm_login' AND created_at >= cur_from AND created_at < cur_to) AS logins,
    count(*) FILTER (WHERE event = 'love' AND created_at >= prev_from AND created_at < cur_from) AS prev_loves,
    count(*) FILTER (WHERE event = 'lastfm_login' AND created_at >= prev_from AND created_at < cur_from) AS prev_logins
  FROM app_events, bounds
)
SELECT jsonb_build_object(
  'week_start', week_start,
  'plays', (SELECT count(*) FROM cur_plays),
  'unique_songs', (SELECT count(DISTINCT song_id) FROM cur_plays),
  'prev_plays', (SELECT count(*) FROM prev_plays),
  'top_songs', coalesce((SELECT jsonb_agg(jsonb_build_object('song_id', song_id, 'title', title, 'artists', artists, 'plays', plays)) FROM top), '[]'::jsonb),
  'busiest_day', (SELECT jsonb_build_object('day', day, 'plays', plays) FROM busiest),
  'trend', coalesce((SELECT jsonb_agg(jsonb_build_object('week_start', ws, 'plays', plays)) FROM trend), '[]'::jsonb),
  'loves', (SELECT loves FROM ev),
  'unloves', (SELECT unloves FROM ev),
  'logins', (SELECT logins FROM ev),
  'prev_loves', (SELECT prev_loves FROM ev),
  'prev_logins', (SELECT prev_logins FROM ev)
);
$$;

REVOKE ALL ON FUNCTION private.weekly_digest_stats(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.weekly_digest_stats(date) TO service_role;