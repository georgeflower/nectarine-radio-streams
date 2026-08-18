-- Expose only aggregates via SECURITY DEFINER functions, keep views as security_invoker
CREATE OR REPLACE FUNCTION public.stream_reliability_agg()
RETURNS TABLE (
  stream_url text,
  stream_name text,
  bitrate integer,
  connects bigint,
  failures bigint,
  handover_events bigint,
  avg_played_sec_before_failure numeric,
  live_seeks bigint,
  avg_live_seek_lag_sec numeric,
  last_seen_at timestamptz,
  raw_failures bigint,
  incidents bigint,
  recoveries bigint,
  ended_events bigint,
  recent_connects bigint,
  recent_incidents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT * FROM public.stream_events WHERE created_at > now() - interval '14 days'
), fail_rows AS (
  SELECT b.stream_url, b.session_id, b.created_at, b.played_sec,
    CASE WHEN lag(b.created_at) OVER (PARTITION BY b.stream_url, b.session_id ORDER BY b.created_at) IS NULL
          OR (b.created_at - lag(b.created_at) OVER (PARTITION BY b.stream_url, b.session_id ORDER BY b.created_at)) > interval '5 minutes'
      THEN 1 ELSE 0 END AS is_new_incident
  FROM base b WHERE b.event = ANY (ARRAY['error','stall'])
), grouped AS (
  SELECT f.stream_url, f.session_id, f.created_at, f.played_sec,
    sum(f.is_new_incident) OVER (PARTITION BY f.stream_url, f.session_id ORDER BY f.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS incident_no
  FROM fail_rows f
), incidents AS (
  SELECT g.stream_url, g.session_id, g.incident_no, min(g.created_at) AS started_at, avg(g.played_sec) AS played_sec
  FROM grouped g GROUP BY g.stream_url, g.session_id, g.incident_no
), incident_agg AS (
  SELECT i.stream_url, count(*) AS incidents,
    count(*) FILTER (WHERE i.started_at > now() - interval '3 days') AS recent_incidents,
    avg(i.played_sec) AS avg_played_sec_before_failure
  FROM incidents i GROUP BY i.stream_url
), event_agg AS (
  SELECT b.stream_url, max(b.stream_name) AS stream_name, max(b.bitrate) AS bitrate,
    count(*) FILTER (WHERE b.event = 'connect_ok') AS connects,
    count(*) FILTER (WHERE b.event = 'connect_ok' AND b.created_at > now() - interval '3 days') AS recent_connects,
    count(*) FILTER (WHERE b.event = ANY (ARRAY['error','stall'])) AS raw_failures,
    count(*) FILTER (WHERE b.event = 'recovered') AS recoveries,
    count(*) FILTER (WHERE b.event = 'ended') AS ended_events,
    count(*) FILTER (WHERE b.event = 'connection_change') AS handover_events,
    count(*) FILTER (WHERE b.event = 'live_seek') AS live_seeks,
    avg(b.lag_sec) FILTER (WHERE b.event = 'live_seek') AS avg_live_seek_lag_sec,
    max(b.created_at) AS last_seen_at
  FROM base b GROUP BY b.stream_url
)
SELECT e.stream_url, e.stream_name, e.bitrate, e.connects,
  GREATEST(COALESCE(i.incidents, 0) - e.recoveries, 0) AS failures,
  e.handover_events, i.avg_played_sec_before_failure, e.live_seeks, e.avg_live_seek_lag_sec,
  e.last_seen_at, e.raw_failures, COALESCE(i.incidents, 0) AS incidents, e.recoveries,
  e.ended_events, e.recent_connects, COALESCE(i.recent_incidents, 0) AS recent_incidents
FROM event_agg e LEFT JOIN incident_agg i ON i.stream_url = e.stream_url;
$$;

CREATE OR REPLACE FUNCTION public.song_play_counts_agg()
RETURNS TABLE (song_id text, plays bigint, first_played timestamptz, last_played timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.song_id, count(*)::bigint, min(p.playstart), max(p.playstart)
  FROM public.song_plays p GROUP BY p.song_id;
$$;

GRANT EXECUTE ON FUNCTION public.stream_reliability_agg() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.song_play_counts_agg() TO anon, authenticated, service_role;

DROP VIEW IF EXISTS public.song_search;
DROP VIEW IF EXISTS public.song_play_counts;
DROP VIEW IF EXISTS public.stream_reliability;

CREATE VIEW public.stream_reliability WITH (security_invoker = true) AS
  SELECT * FROM public.stream_reliability_agg();

CREATE VIEW public.song_play_counts WITH (security_invoker = true) AS
  SELECT * FROM public.song_play_counts_agg();

CREATE VIEW public.song_search WITH (security_invoker = true) AS
SELECT s.*,
       COALESCE(pc.plays, 0) AS plays,
       pc.first_played,
       pc.last_played,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('artist_id', a.artist_id, 'artist_name', a.artist_name, 'position', a.position) ORDER BY a.position, a.artist_id)
                 FROM public.song_artists a WHERE a.song_id = s.song_id), '[]'::jsonb) AS artists,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('group_id', g.group_id, 'group_name', g.group_name) ORDER BY g.group_id)
                 FROM public.song_groups g WHERE g.song_id = s.song_id), '[]'::jsonb) AS groups,
       COALESCE((SELECT array_agg(t.tag_norm ORDER BY t.tag_norm)
                 FROM public.song_tags t WHERE t.song_id = s.song_id), ARRAY[]::text[]) AS tags,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('source_id', l.source_id, 'source_name', l.source_name, 'url', l.url) ORDER BY l.source_id)
                 FROM public.song_links l WHERE l.song_id = s.song_id), '[]'::jsonb) AS links
FROM public.songs s
LEFT JOIN public.song_play_counts pc ON pc.song_id = s.song_id;

GRANT SELECT ON public.stream_reliability TO anon, authenticated;
GRANT SELECT ON public.song_play_counts TO anon, authenticated;
GRANT SELECT ON public.song_search TO anon, authenticated;