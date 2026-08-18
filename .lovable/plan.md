Move the backend to your own Supabase project

Target project: `https://asfcqlcwlaetbabikqny.supabase.co` (ref `asfcqlcwlaetbabikqny`) — the same project your MCP config already references.

## What is honestly possible from here

- Lovable Cloud cannot be removed from this project; we redirect the app away from it. The Cloud project keeps existing but stops being used.
- I can read everything out of the Cloud database and generate complete SQL (schema + data). I cannot write to your project directly — my database tooling only reaches the Cloud project. You will run the generated SQL in your own project's SQL editor, or I can walk you through the CLI.
- Edge functions: the source lives in this repo and will point at your project via env vars, but Lovable's auto-deploy targets the Cloud project. Deploying to yours needs `supabase functions deploy` with your CLI login. I will prepare everything so it is a single command per function.
- Secrets (`LASTFM_API_KEY`, `LASTFM_API_SECRET`, `LOVABLE_API_KEY`) must be re-added as secrets in your own project — I cannot read their values out of Cloud.

## Step 1 — Export schema

Generate `supabase/migrations/<timestamp>_full_schema.sql` containing, in correct order:

- Tables: `songs`, `song_artists`, `song_groups`, `song_tags`, `song_links`, `song_plays`, `stream_events`
- Sequences for `song_plays.id` and `stream_events.id`
- All indexes, including the GIN search indexes
- GRANTs for `anon` / `authenticated` / `service_role` matching current privileges (public read on song tables; no client access to `song_plays` and `stream_events`)
- `ENABLE ROW LEVEL SECURITY` plus the existing public-read policies
- Views: `song_search`, `stream_reliability`, and the aggregate views used for play/stream stats
- Any functions and triggers currently present

## Step 2 — Export data

Dump current rows to `supabase/seed/` as SQL inserts, one file per table, in FK-safe order (`songs` first, then child tables, then `song_plays` / `stream_events`). Large tables are chunked so the SQL editor can accept them.

## Step 3 — Repoint the app

- `.env`: `VITE_SUPABASE_URL=https://asfcqlcwlaetbabikqny.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_iK__ZqFMW9kIfDUZNP33jA_A3EwQ41f`, `VITE_SUPABASE_PROJECT_ID=asfcqlcwlaetbabikqny`
- `supabase/config.toml`: `project_id = "asfcqlcwlaetbabikqny"`, keeping all existing `verify_jwt = false` entries
- `.mcp.json`: already correct, unchanged
- `src/integrations/supabase/client.ts`: untouched (reads env vars)

## Step 4 — Edge functions

All eight functions (`xml-proxy`, `audio-proxy`, `song-artwork`, `song-play`, `song-ingest`, `stream-telemetry`, `lastfm-auth`, `lastfm-scrobble`) stay as-is in the repo — they read `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from their own runtime environment, which your project supplies automatically.

I will write `docs/self-hosting.md` with the exact deploy commands, the secrets to set, and the `verify_jwt` flags each function needs.

## Step 5 — Verify

- Restart the dev server and confirm it boots clean.
- Check in the browser that requests go to `asfcqlcwlaetbabikqny.supabase.co`.
- Confirm the song panel, Extra Resources links and telemetry work once you have applied the SQL and deployed the functions; report anything still degraded.

## Your manual steps

1. Run the generated schema SQL in your project.
2. Run the seed SQL.
3. `supabase login`, then deploy the functions using the documented commands.
4. Add the Last.fm secrets in your project.
