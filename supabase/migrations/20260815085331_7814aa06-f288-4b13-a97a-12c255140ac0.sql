ALTER TABLE public.stream_events DROP CONSTRAINT IF EXISTS stream_events_event_check;
ALTER TABLE public.stream_events ADD CONSTRAINT stream_events_event_check CHECK (event = ANY (ARRAY['connect_ok'::text, 'error'::text, 'stall'::text, 'ended'::text, 'recovered'::text, 'failover'::text, 'switch'::text, 'connection_change'::text, 'live_seek'::text]));

ALTER TABLE public.stream_events ADD COLUMN IF NOT EXISTS lag_sec numeric;

DROP VIEW IF EXISTS public.stream_reliability;
CREATE VIEW public.stream_reliability WITH (security_invoker = true) AS
 SELECT stream_url,
    max(stream_name) AS stream_name,
    max(bitrate) AS bitrate,
    count(*) FILTER (WHERE event = 'connect_ok'::text) AS connects,
    count(*) FILTER (WHERE event = ANY (ARRAY['error'::text, 'stall'::text, 'ended'::text])) AS failures,
    count(*) FILTER (WHERE event = 'connection_change'::text) AS handover_events,
    avg(played_sec) FILTER (WHERE event = ANY (ARRAY['error'::text, 'stall'::text, 'ended'::text])) AS avg_played_sec_before_failure,
    count(*) FILTER (WHERE event = 'live_seek'::text) AS live_seeks,
    avg(lag_sec) FILTER (WHERE event = 'live_seek'::text) AS avg_live_seek_lag_sec,
    max(created_at) AS last_seen_at
   FROM public.stream_events
  WHERE created_at > (now() - '14 days'::interval)
  GROUP BY stream_url;

GRANT SELECT ON public.stream_reliability TO anon;
GRANT SELECT ON public.stream_reliability TO authenticated;