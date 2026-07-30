CREATE TABLE public.stream_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  stream_url text NOT NULL,
  stream_name text,
  bitrate int,
  event text NOT NULL,
  reason text,
  media_error_code int,
  media_error_message text,
  network_state int,
  ready_state int,
  platform text,
  connection_type text,
  effective_type text,
  downlink numeric,
  ms_since_connection_change int,
  played_sec int,
  hidden boolean,
  CONSTRAINT stream_events_event_check CHECK (event IN ('connect_ok','error','stall','ended','recovered','failover','switch','connection_change'))
);

GRANT SELECT ON public.stream_events TO anon;
GRANT SELECT ON public.stream_events TO authenticated;
GRANT ALL ON public.stream_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.stream_events_id_seq TO service_role;

ALTER TABLE public.stream_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stream events are publicly readable"
ON public.stream_events
FOR SELECT
USING (true);

CREATE INDEX stream_events_url_created_idx ON public.stream_events (stream_url, created_at DESC);
CREATE INDEX stream_events_created_idx ON public.stream_events (created_at DESC);

CREATE VIEW public.stream_reliability WITH (security_invoker = true) AS
SELECT
  stream_url,
  max(stream_name)  AS stream_name,
  max(bitrate)      AS bitrate,
  count(*) FILTER (WHERE event = 'connect_ok')                    AS connects,
  count(*) FILTER (WHERE event IN ('error','stall','ended'))      AS failures,
  count(*) FILTER (WHERE event = 'connection_change')             AS handover_events,
  avg(played_sec) FILTER (WHERE event IN ('error','stall','ended')) AS avg_played_sec_before_failure,
  max(created_at)   AS last_seen_at
FROM public.stream_events
WHERE created_at > now() - interval '14 days'
GROUP BY stream_url;

GRANT SELECT ON public.stream_reliability TO anon;
GRANT SELECT ON public.stream_reliability TO authenticated;