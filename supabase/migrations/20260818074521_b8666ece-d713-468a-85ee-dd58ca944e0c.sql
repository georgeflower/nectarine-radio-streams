-- Lock down raw play logs (requester handles) and raw stream diagnostics (session ids, device/network data)
DROP POLICY IF EXISTS "Song plays are publicly readable" ON public.song_plays;
DROP POLICY IF EXISTS "Stream events are publicly readable" ON public.stream_events;
REVOKE SELECT ON public.song_plays FROM anon, authenticated;
REVOKE SELECT ON public.stream_events FROM anon, authenticated;

-- Keep aggregate-only views working for the public app
ALTER VIEW public.song_play_counts SET (security_invoker = false);
ALTER VIEW public.stream_reliability SET (security_invoker = false);
GRANT SELECT ON public.song_play_counts TO anon, authenticated;
GRANT SELECT ON public.stream_reliability TO anon, authenticated;