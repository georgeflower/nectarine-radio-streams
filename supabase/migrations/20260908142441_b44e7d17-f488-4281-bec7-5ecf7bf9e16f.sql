CREATE TABLE public.listener_days (
  id bigserial PRIMARY KEY,
  day date NOT NULL,
  client_id text NOT NULL,
  net_hash text,
  country text NOT NULL DEFAULT '??',
  platform text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, client_id)
);
CREATE INDEX listener_days_day_idx ON public.listener_days (day);
GRANT ALL ON public.listener_days TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.listener_days_id_seq TO service_role;
ALTER TABLE public.listener_days ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.weekly_digest_stats(week_start date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
weeks AS (
  SELECT week_start - 21 AS ws UNION ALL SELECT week_start - 14 UNION ALL SELECT week_start - 7 UNION ALL SELECT week_start
),
-- One row per (week, browser id); a browser is a duplicate when an earlier
-- browser id in the same week shares its network hash.
week_clients AS (
  SELECT wk.ws, ld.client_id, min(ld.first_seen_at) AS first_seen,
         (array_agg(ld.net_hash ORDER BY ld.first_seen_at) FILTER (WHERE ld.net_hash IS NOT NULL))[1] AS net_hash
  FROM weeks wk JOIN listener_days ld ON ld.day >= wk.ws AND ld.day < wk.ws + 7
  GROUP BY wk.ws, ld.client_id
),
week_unique AS (
  SELECT ws, client_id,
         (net_hash IS NULL OR row_number() OVER (PARTITION BY ws, net_hash ORDER BY first_seen, client_id) = 1) AS is_unique
  FROM week_clients
),
week_counts AS (
  SELECT wk.ws,
         (SELECT count(*) FROM week_unique u WHERE u.ws = wk.ws) AS listeners_raw,
         (SELECT count(*) FROM week_unique u WHERE u.ws = wk.ws AND u.is_unique) AS listeners
  FROM weeks wk
),
trend AS (
  SELECT wk.ws,
         (SELECT count(*) FROM song_plays sp
           WHERE sp.playstart >= (wk.ws::timestamp AT TIME ZONE 'Europe/Stockholm')
             AND sp.playstart <  ((wk.ws + 7)::timestamp AT TIME ZONE 'Europe/Stockholm')) AS plays,
         wc.listeners
  FROM weeks wk JOIN week_counts wc ON wc.ws = wk.ws
  ORDER BY wk.ws
),
countries AS (
  SELECT coalesce(ld.country, '??') AS country, count(*) AS listeners
  FROM week_unique u
  JOIN LATERAL (
    SELECT country FROM listener_days d
    WHERE d.client_id = u.client_id AND d.day >= week_start AND d.day < week_start + 7
    ORDER BY (country = '??'), first_seen_at LIMIT 1
  ) ld ON true
  WHERE u.ws = week_start AND u.is_unique
  GROUP BY 1 ORDER BY listeners DESC, country
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
  'trend', coalesce((SELECT jsonb_agg(jsonb_build_object('week_start', ws, 'plays', plays, 'listeners', listeners) ORDER BY ws) FROM trend), '[]'::jsonb),
  'listeners', (SELECT listeners FROM week_counts WHERE ws = week_start),
  'listeners_raw', (SELECT listeners_raw FROM week_counts WHERE ws = week_start),
  'prev_listeners', (SELECT listeners FROM week_counts WHERE ws = week_start - 7),
  'countries', coalesce((SELECT jsonb_agg(jsonb_build_object('country', country, 'listeners', listeners)) FROM countries), '[]'::jsonb),
  'loves', (SELECT loves FROM ev),
  'unloves', (SELECT unloves FROM ev),
  'logins', (SELECT logins FROM ev),
  'prev_loves', (SELECT prev_loves FROM ev),
  'prev_logins', (SELECT prev_logins FROM ev)
);
$function$;