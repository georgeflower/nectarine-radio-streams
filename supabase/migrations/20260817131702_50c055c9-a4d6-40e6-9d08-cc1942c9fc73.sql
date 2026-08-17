DROP INDEX IF EXISTS public.songs_title_trgm_idx;
DROP INDEX IF EXISTS public.song_artists_name_trgm_idx;
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX songs_title_trgm_idx ON public.songs USING gin (title extensions.gin_trgm_ops);
CREATE INDEX song_artists_name_trgm_idx ON public.song_artists USING gin (artist_name extensions.gin_trgm_ops);