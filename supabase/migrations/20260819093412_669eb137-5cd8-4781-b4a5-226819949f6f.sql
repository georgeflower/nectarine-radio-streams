create or replace view public.song_last_played
with (security_invoker = true) as
select song_id, max(playstart) as last_played_locally
from public.song_plays
group by song_id;

grant select on public.song_last_played to anon, authenticated;