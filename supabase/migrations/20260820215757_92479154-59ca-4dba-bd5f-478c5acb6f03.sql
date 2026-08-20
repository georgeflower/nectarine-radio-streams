CREATE TABLE public.upstream_fetches (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  endpoint text NOT NULL,
  entity_id text,
  outcome text NOT NULL,
  source text NOT NULL,
  status integer,
  CONSTRAINT upstream_fetches_endpoint_check CHECK (endpoint IN ('queue','oneliner','online','streams','song','artist','group','compilation','user','other')),
  CONSTRAINT upstream_fetches_outcome_check CHECK (outcome IN ('fetched','cache','claimed','error')),
  CONSTRAINT upstream_fetches_source_check CHECK (source IN ('xml-proxy','song-refresh'))
);

CREATE INDEX upstream_fetches_created_at_idx ON public.upstream_fetches (created_at DESC);

GRANT ALL ON public.upstream_fetches TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.upstream_fetches_id_seq TO service_role;

ALTER TABLE public.upstream_fetches ENABLE ROW LEVEL SECURITY;

CREATE VIEW public.upstream_fetch_stats
WITH (security_invoker = true) AS
SELECT
  date_trunc('hour', created_at) AS hour,
  endpoint,
  source,
  count(*) AS calls,
  count(*) FILTER (WHERE outcome = 'fetched') AS upstream_fetches,
  count(*) FILTER (WHERE outcome IN ('cache','claimed')) AS avoided,
  count(*) FILTER (WHERE outcome = 'error') AS errors,
  round(
    count(*) FILTER (WHERE outcome IN ('cache','claimed'))::numeric
      / NULLIF(count(*), 0), 3
  ) AS hit_ratio
FROM public.upstream_fetches
GROUP BY 1, 2, 3;

GRANT SELECT ON public.upstream_fetch_stats TO service_role;