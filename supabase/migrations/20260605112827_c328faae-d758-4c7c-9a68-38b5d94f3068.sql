CREATE TABLE IF NOT EXISTS public.goose_lexicon (
  token text PRIMARY KEY,
  category text NOT NULL DEFAULT 'neutral',
  seen integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  style_flags text[] NOT NULL DEFAULT '{}'::text[]
);

GRANT SELECT ON public.goose_lexicon TO anon;
GRANT SELECT ON public.goose_lexicon TO authenticated;
GRANT ALL ON public.goose_lexicon TO service_role;

ALTER TABLE public.goose_lexicon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lexicon is publicly readable"
  ON public.goose_lexicon
  FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS goose_lexicon_recency_idx
  ON public.goose_lexicon (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS goose_lexicon_seen_idx
  ON public.goose_lexicon (seen DESC);