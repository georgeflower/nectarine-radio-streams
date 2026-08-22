CREATE POLICY "Stream events are publicly readable"
  ON public.stream_events
  FOR SELECT
  USING (true);

CREATE POLICY "Song plays are publicly readable"
  ON public.song_plays
  FOR SELECT
  USING (true);