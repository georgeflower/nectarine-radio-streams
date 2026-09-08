# Weekly email digest: plays, loves, Last.fm sign-ins

Every Monday morning you get one short email with last week's numbers, so you never have to open the app to check.

## What the email will contain

- Plays: total tracks played last week, unique songs, top 5 most-played songs, busiest day.
- Loves: number of tracks loved (and unloved) via the heart button.
- Last.fm: number of successful sign-ins (connects) last week.
- A "vs. previous week" delta next to each headline number.
- Trend context: plays for each of the last 4 weeks.

Plain, readable layout in the app's amber/CRT spirit, but simple HTML that renders in any mail client.

## Prerequisites (need you)

1. **Sender domain.** Emails must come from a domain you own; there is no shared Lovable sender. The setup card in chat walks through adding the DNS records. Building can proceed while DNS verifies; emails start once it is verified.
2. **Recipient address.** Tell me which address should receive the digest. It is stored as a private setting, not in code.

## Data gaps to close first

Plays already land in `song_plays`. Loves and Last.fm sign-ins are currently only forwarded to Last.fm and never counted locally, so the digest would say 0 for them. Fix: record a tiny event row whenever a love/unlove or a sign-in succeeds. No personal data beyond what is already sent: song id and a hashed session id for loves, a timestamp only for sign-ins.

## Steps

1. Database: new write-only telemetry table `app_events` (event kind, song id, created_at) with service-role access only, same posture as `upstream_fetches`. Weekly digest reads it through a private aggregate function.
2. Edge functions: `lastfm-scrobble` records `love` / `unlove` after a successful Last.fm response; `lastfm-auth` records `lastfm_login` after a successful session exchange. Failures to record never affect the user-facing response.
3. Email infrastructure: enable Lovable's built-in sending once the domain is set, and scaffold the app-email helper and a `weekly-digest` template.
4. New edge function `weekly-digest`: computes the numbers for the previous Monday–Sunday window (Stockholm time), renders the template, sends one email to the configured recipient. Idempotent per week (a `digest_runs` row keyed by week start) so a retry never sends twice.
5. Schedule: a weekly database cron (Monday 07:00 Stockholm) that calls `weekly-digest`. One run per week; negligible cost.
6. Manual trigger: a "Send digest now" button in Settings > Diagnostics for testing, which sends the current partial week and is marked as a test in the subject.

## Technical details

- `app_events(id bigserial, event text check in ('love','unlove','lastfm_login'), song_id text null, session_hash text null, created_at timestamptz default now())`; GRANT to service_role only; RLS enabled with no public policies.
- Aggregation via `private.weekly_digest_stats(week_start date)` SECURITY DEFINER returning plays, unique songs, top songs (joined to `songs.title` and `song_artists`), loves, unloves, logins, plus the same for the prior week and a 4-week play series.
- `weekly-digest` uses the scaffolded send helper (`purpose: transactional`, idempotency key `weekly-digest:<week_start>`), recipient from secret `DIGEST_RECIPIENT_EMAIL`. Requires a shared secret header (`DIGEST_CRON_SECRET`, generated) so only the cron or an authenticated manual trigger can fire it.
- Cron: `pg_cron` + `pg_net` `http_post` to the function with the secret header, `0 5 * * 1` UTC (07:00 Stockholm in summer; adjusted to 06:00 UTC in winter or use a Europe/Stockholm-aware check inside the function).
- Manual button calls `weekly-digest` with `{ test: true }`; skips the idempotency guard and prefixes the subject with `[TEST]`.
- Tests: unit tests for the week-window calculation and the delta formatting; `bunx tsc --noEmit` and `bunx vitest run`.

## Out of scope

Per-listener stats, Last.fm scrobble counts (those live on Last.fm), and any change to how plays are logged.
