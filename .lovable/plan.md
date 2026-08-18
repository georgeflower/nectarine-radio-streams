Migrate project from Lovable Cloud to user's own Supabase

Goal: Point the app, its MCP configuration, and edge function config at the user's own Supabase project instead of the Lovable-managed project.

Steps:

1. Gather the user's Supabase project details
   - Ask for the Supabase project URL (e.g. `https://<project-ref>.supabase.co`).
   - Ask for the anon/publishable key.

2. Update project connection files
   - Write the new URL and publishable key to `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`).
   - Update `.mcp.json` so the Supabase MCP server points to the new project ref.
   - Update `supabase/config.toml` `project_id` to match the new project.

3. Verify the client import stays untouched
   - `src/integrations/supabase/client.ts` is auto-generated and reads `.env`; do not edit it.

4. Validate after migration
   - Run a build check to ensure Vite replaces the env vars correctly.
   - Confirm the project info / health checks return the new project ID.
   - Leave the existing database schema and edge functions as-is; no migration is required on the new project unless the user wants to seed/copy data.

Out of scope (unless explicitly asked):
- Moving data from the Lovable Cloud database to the new project.
- Reconfiguring auth providers or social login on the new project.
- Reconnecting Lovable Cloud-specific features.
