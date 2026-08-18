DROP VIEW IF EXISTS public.stream_reliability;

CREATE VIEW public.stream_reliability
WITH (security_invoker = true) AS
WITH base AS (
  SELECT *
  FROM public.stream_events
  WHERE created_at > now() - interval '14 days'
),
fail_rows AS (
  SELECT
    stream_url,
    session_id,
    created_at,
    played_sec,
    CASE
      WHEN lag(created_at) OVER (PARTITION BY stream_url, session_id ORDER BY created_at) IS NULL
        OR created_at - lag(created_at) OVER (PARTITION BY stream_url, session_id ORDER BY created_at) > interval '5 minutes'
      THEN 1 ELSE 0
    END AS is_new_incident
  FROM base
  WHERE event IN ('error', 'stall')
),
grouped AS (
  SELECT
    stream_url,
    session_id,
    created_at,
    played_sec,
    sum(is_new_incident) OVER (
      PARTITION BY stream_url, session_id
      ORDER BY created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS incident_no
  FROM fail_rows
),
incidents AS (
  SELECT
    stream_url,
    session_id,
    incident_no,
    min(created_at) AS started_at,
    avg(played_sec) AS played_sec
  FROM grouped
  GROUP BY stream_url, session_id, incident_no
),
incident_agg AS (
  SELECT
    stream_url,
    count(*) AS incidents,
    count(*) FILTER (WHERE started_at > now() - interval '3 days') AS recent_incidents,
    avg(played_sec) AS avg_played_sec_before_failure
  FROM incidents
  GROUP BY stream_url
),
event_agg AS (
  SELECT
    stream_url,
    max(stream_name) AS stream_name,
    max(bitrate) AS bitrate,
    count(*) FILTER (WHERE event = 'connect_ok') AS connects,
    count(*) FILTER (WHERE event = 'connect_ok' AND created_at > now() - interval '3 days') AS recent_connects,
    count(*) FILTER (WHERE event IN ('error', 'stall')) AS raw_failures,
    count(*) FILTER (WHERE event = 'recovered') AS recoveries,
    count(*) FILTER (WHERE event = 'ended') AS ended_events,
    count(*) FILTER (WHERE event = 'connection_change') AS handover_events,
    count(*) FILTER (WHERE event = 'live_seek') AS live_seeks,
    avg(lag_sec) FILTER (WHERE event = 'live_seek') AS avg_live_seek_lag_sec,
    max(created_at) AS last_seen_at
  FROM base
  GROUP BY stream_url
)
SELECT
  e.stream_url,
  e.stream_name,
  e.bitrate,
  e.connects,
  GREATEST(COALESCE(i.incidents, 0) - e.recoveries, 0) AS failures,
  e.handover_events,
  i.avg_played_sec_before_failure,
  e.live_seeks,
  e.avg_live_seek_lag_sec,
  e.last_seen_at,
  e.raw_failures,
  COALESCE(i.incidents, 0) AS incidents,
  e.recoveries,
  e.ended_events,
  e.recent_connects,
  COALESCE(i.recent_incidents, 0) AS recent_incidents
FROM event_agg e
LEFT JOIN incident_agg i ON i.stream_url = e.stream_url;

GRANT SELECT ON public.stream_reliability TO anon, authenticated;