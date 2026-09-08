CREATE OR REPLACE FUNCTION public.weekly_digest_stats(week_start date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT private.weekly_digest_stats(week_start); $$;
REVOKE ALL ON FUNCTION public.weekly_digest_stats(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_digest_stats(date) TO service_role;