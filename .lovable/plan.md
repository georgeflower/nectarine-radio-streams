Point the app at your own Supabase project

Target project: `https://asfcqlcwlaetbabikqny.supabase.co` (ref `asfcqlcwlaetbabikqny`) — this is the same project your MCP config already references.

## Important caveats before we start

- Lovable Cloud cannot be removed from this project. It stays provisioned; we are redirecting the app's client to your project instead.
- Backend tooling in Lovable (migration tool, edge function deploys, secrets, logs) will keep targeting the Lovable-managed project. After this switch, schema changes and edge function deploys for your own project need to be done by you in your Supabase account.
- The app depends on edge functions (`xml-proxy`, `audio-proxy`, `song-play`, `song-ingest`, `stream-telemetry`, `song-artwork`, `lastfm-auth`, `lastfm-scrobble`) and on tables (`songs`, `song_artists`, `song_groups`, `song_tags`, `song_links`, `song_plays`, `stream_events` and the `stream_reliability` / `song_search` views). None of these exist in your project yet, so playback proxying, song enrichment, extra resource links and Last.fm will break until they are deployed there.
- Your key is a new-format publishable key (`sb_publishable_...`). It works with the current supabase-js client.

## What I will change

1. `.env`
   - `VITE_SUPABASE_URL="https://asfcqlcwlaetbabikqny.supabase.co"`
   - `VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_iK__ZqFMW9kIfDUZNP33jA_A3EwQ41f"`
   - `VITE_SUPABASE_PROJECT_ID="asfcqlcwlaetbabikqny"`

2. `supabase/config.toml`
   - `project_id = "asfcqlcwlaetbabikqny"`, keeping all existing `verify_jwt = false` function entries so they carry over when you deploy.

3. `.mcp.json`
   - Already points at `asfcqlcwlaetbabikqny`; left unchanged.

4. `src/integrations/supabase/client.ts`
   - Left untouched. It reads the env vars, so it picks up the new project automatically.

5. Export the current schema
   - Write the full SQL for all existing tables, views, grants and RLS policies to `supabase/migrations/` so you can apply it to your project with the Supabase CLI.

## Verification

- Restart the dev server and confirm the app boots without Supabase client errors.
- Load the preview and check the network panel shows requests going to `asfcqlcwlaetbabikqny.supabase.co`.
- Report which features are degraded until you deploy the functions and schema on your side.

## Out of scope

- Copying existing data out of the Lovable Cloud database.
- Deploying edge functions to your project (needs your Supabase CLI login).
- Configuring auth providers or secrets on your project.
