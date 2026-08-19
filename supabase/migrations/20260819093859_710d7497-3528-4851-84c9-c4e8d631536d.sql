alter table public.songs add column if not exists refresh_claimed_at timestamptz;
create index if not exists songs_refresh_claimed_at_idx on public.songs (refresh_claimed_at);