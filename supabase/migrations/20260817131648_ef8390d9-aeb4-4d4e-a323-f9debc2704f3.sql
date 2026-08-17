CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE public.songs (
  song_id text PRIMARY KEY,
  title text,
  status_text text,
  status_v text,
  bitrate int,
  samplerate int,
  rating numeric,
  votes int,
  info text,
  length_sec int,
  lastplayed timestamptz,
  platform_id text,
  platform_name text,
  type_id text,
  type_name text,
  pouet_id text,
  yt_id text,
  yt_offset int,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_enriched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.song_artists (
  song_id text NOT NULL REFERENCES public.songs(song_id) ON DELETE CASCADE,
  artist_id text NOT NULL,
  artist_name text,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (song_id, artist_id)
);

CREATE TABLE public.song_groups (
  song_id text NOT NULL REFERENCES public.songs(song_id) ON DELETE CASCADE,
  group_id text NOT NULL,
  group_name text,
  PRIMARY KEY (song_id, group_id)
);

CREATE TABLE public.song_tags (
  song_id text NOT NULL REFERENCES public.songs(song_id) ON DELETE CASCADE,
  tag text NOT NULL,
  tag_norm text GENERATED ALWAYS AS (lower(trim(tag))) STORED,
  PRIMARY KEY (song_id, tag)
);

CREATE TABLE public.song_links (
  song_id text NOT NULL REFERENCES public.songs(song_id) ON DELETE CASCADE,
  source_id text NOT NULL,
  source_name text,
  url text,
  PRIMARY KEY (song_id, source_id)
);

CREATE TABLE public.song_plays (
  id bigserial PRIMARY KEY,
  song_id text NOT NULL,
  playstart timestamptz NOT NULL,
  length_sec int,
  requester text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, playstart)
);

CREATE INDEX song_plays_song_id_idx ON public.song_plays (song_id);
CREATE INDEX song_plays_playstart_idx ON public.song_plays (playstart DESC);
CREATE INDEX song_tags_tag_norm_idx ON public.song_tags (tag_norm);
CREATE INDEX song_artists_artist_id_idx ON public.song_artists (artist_id);
CREATE INDEX songs_last_enriched_at_idx ON public.songs (last_enriched_at);
CREATE INDEX songs_title_trgm_idx ON public.songs USING gin (title public.gin_trgm_ops);
CREATE INDEX song_artists_name_trgm_idx ON public.song_artists USING gin (artist_name public.gin_trgm_ops);

GRANT SELECT ON public.songs TO anon, authenticated;
GRANT SELECT ON public.song_artists TO anon, authenticated;
GRANT SELECT ON public.song_groups TO anon, authenticated;
GRANT SELECT ON public.song_tags TO anon, authenticated;
GRANT SELECT ON public.song_links TO anon, authenticated;
GRANT SELECT ON public.song_plays TO anon, authenticated;
GRANT ALL ON public.songs TO service_role;
GRANT ALL ON public.song_artists TO service_role;
GRANT ALL ON public.song_groups TO service_role;
GRANT ALL ON public.song_tags TO service_role;
GRANT ALL ON public.song_links TO service_role;
GRANT ALL ON public.song_plays TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.song_plays_id_seq TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.songs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.song_artists FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.song_groups FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.song_tags FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.song_links FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.song_plays FROM anon, authenticated;

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Songs are publicly readable" ON public.songs FOR SELECT USING (true);
CREATE POLICY "Song artists are publicly readable" ON public.song_artists FOR SELECT USING (true);
CREATE POLICY "Song groups are publicly readable" ON public.song_groups FOR SELECT USING (true);
CREATE POLICY "Song tags are publicly readable" ON public.song_tags FOR SELECT USING (true);
CREATE POLICY "Song links are publicly readable" ON public.song_links FOR SELECT USING (true);
CREATE POLICY "Song plays are publicly readable" ON public.song_plays FOR SELECT USING (true);

CREATE VIEW public.song_play_counts WITH (security_invoker = true) AS
SELECT song_id,
       count(*)::bigint AS plays,
       min(playstart) AS first_played,
       max(playstart) AS last_played
FROM public.song_plays
GROUP BY song_id;

CREATE VIEW public.song_search WITH (security_invoker = true) AS
SELECT s.*,
       COALESCE(pc.plays, 0) AS plays,
       pc.first_played,
       pc.last_played,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('artist_id', a.artist_id, 'artist_name', a.artist_name, 'position', a.position) ORDER BY a.position, a.artist_id)
                 FROM public.song_artists a WHERE a.song_id = s.song_id), '[]'::jsonb) AS artists,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('group_id', g.group_id, 'group_name', g.group_name) ORDER BY g.group_id)
                 FROM public.song_groups g WHERE g.song_id = s.song_id), '[]'::jsonb) AS groups,
       COALESCE((SELECT array_agg(t.tag_norm ORDER BY t.tag_norm)
                 FROM public.song_tags t WHERE t.song_id = s.song_id), ARRAY[]::text[]) AS tags,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('source_id', l.source_id, 'source_name', l.source_name, 'url', l.url) ORDER BY l.source_id)
                 FROM public.song_links l WHERE l.song_id = s.song_id), '[]'::jsonb) AS links
FROM public.songs s
LEFT JOIN public.song_play_counts pc ON pc.song_id = s.song_id;

GRANT SELECT ON public.song_play_counts TO anon, authenticated;
GRANT SELECT ON public.song_search TO anon, authenticated;