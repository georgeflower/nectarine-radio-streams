# Weekly digest: listeners per week, per country, and unique listeners

## What you will get in the email

A new "Listeners" block in the weekly digest:

- **Unique listeners this week** with the change vs last week.
- **Listeners per country** — a small table (flag/country code, listeners, share %), top 10 plus "Other".
- **Listener trend** — unique listeners for the last 4 weeks, next to the existing plays trend.

A "listener" is anyone who actually pressed play and the stream started (the moment the app already reports `connect_ok`).

## How uniqueness is made as reliable as possible

No accounts exist, so a listener is identified by combining two independent signals:

1. **Persistent browser id** — the app already stores a random id in the browser (`nectarine-telemetry-session-v1`) that survives reloads and days. This is the primary key for "one listener".
2. **Salted network fingerprint** — on the server, `sha256(weekly salt + IP + user agent)`. This catches the same person after clearing storage or using a private window, and also splits two people who happen to share nothing but a device type.

The unique count = number of distinct browser ids, **minus** browser ids that share a network fingerprint with an earlier browser id in the same week (storage-cleared duplicates). Both raw numbers are also reported ("42 browsers, 39 after merging") so you can see how much merging happened. The IP itself is never stored, only the country code and the hash; the salt rotates weekly so fingerprints cannot be tracked across weeks.

## Country

Looked up server-side once per listener per day. The function first checks any country header the edge platform already provides; if none, it calls a free IP-to-country service (ipapi.co, HTTPS, no key, well within its free quota at current volume — around a dozen listeners a day). Failures store `??` (unknown) and never block playback.

## Technical details

**Migration**
- New table `public.listener_days` (service-role only, RLS on, no client policies — same posture as `app_events`): `day date`, `client_id text`, `net_hash text`, `country text`, `platform text`, `first_seen_at`, `last_seen_at`, unique `(day, client_id)`.
- Extend `private.weekly_digest_stats(date)` with: `listeners`, `listeners_raw`, `prev_listeners`, `countries` (jsonb array of `{country, listeners}`), and a `listeners` value inside each `trend` row. The public wrapper is unchanged.

**New edge function `listener-ping`**
- `POST { client_id, platform }`, called fire-and-forget from the client right where `connect_ok` telemetry is sent (`AudioPlayer.tsx`), at most once per browser per day (guarded by a localStorage stamp).
- Reads IP from `x-forwarded-for`, derives country (header → ipapi.co fallback, 2 s timeout), computes `net_hash` with a weekly salt derived from `DIGEST_CRON_SECRET` + ISO week, and upserts into `listener_days` (updates `last_seen_at` on conflict).
- Validates `client_id` (8–100 chars) and `platform`; always returns 200 so it can never break the player.

**Client**
- `src/lib/listenerPing.ts` (new): once-a-day guard + `supabase.functions.invoke("listener-ping")`.
- `src/components/AudioPlayer.tsx`: one call next to the existing `connect_ok` telemetry.

**Digest**
- `supabase/functions/weekly-digest/digest.ts`: add `listeners`, `listenersRaw`, `listenersDelta`, `countries[]` to `DigestData`; render the Listeners stat, the country table, and listeners in the trend table. Add tests for the country-table rendering and share rounding in the existing digest test file.
- `supabase/functions/weekly-digest/index.ts`: map the new stats fields; add listener count to the email subject.

**Verification**
- Run the dry-run stats query and a test digest after a few pings from the preview; confirm the country table and unique count render, and that `listener_days` rows contain no raw IP.

## Not changed
Existing plays/loves/login stats, stream telemetry, Last.fm, cron schedule, or any client-readable table.
