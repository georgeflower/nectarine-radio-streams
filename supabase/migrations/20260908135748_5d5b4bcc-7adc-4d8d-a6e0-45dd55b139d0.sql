ALTER TABLE public.digest_runs DROP CONSTRAINT digest_runs_pkey;
ALTER TABLE public.digest_runs ADD COLUMN id bigserial PRIMARY KEY;
GRANT USAGE, SELECT ON SEQUENCE public.digest_runs_id_seq TO service_role;
CREATE UNIQUE INDEX digest_runs_real_week_idx ON public.digest_runs (week_start) WHERE NOT is_test;
CREATE INDEX digest_runs_sent_at_idx ON public.digest_runs (sent_at);