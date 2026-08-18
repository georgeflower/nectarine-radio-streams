CREATE SCHEMA IF NOT EXISTS private;

ALTER FUNCTION public.stream_reliability_agg() SET SCHEMA private;
ALTER FUNCTION public.song_play_counts_agg() SET SCHEMA private;

REVOKE ALL ON FUNCTION private.stream_reliability_agg() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.song_play_counts_agg() FROM PUBLIC;

GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.stream_reliability_agg() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.song_play_counts_agg() TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.stream_reliability WITH (security_invoker = true) AS
  SELECT * FROM private.stream_reliability_agg();

CREATE OR REPLACE VIEW public.song_play_counts WITH (security_invoker = true) AS
  SELECT * FROM private.song_play_counts_agg();