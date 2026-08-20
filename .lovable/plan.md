# Measure real scenestream traffic (stop guessing)

## What I checked first

The edge-function log stream is queryable from here, but only over a very short live window: a single query returned 67 total invocations spanning roughly 2.7 minutes (27 `xml-proxy`, 28 `song-refresh`, 9 `song-play`). That is enough to sample the current rate — it extrapolates to roughly 600 `xml-proxy` calls/hour right now — but it cannot be compared against the pre-change baseline, because nothing older is retained. So the only way to get a trustworthy before/after is to record upstream fetches ourselves, from now on.

Important nuance the current numbers already hint at: `xml-proxy` volume is dominated by `queue`/`oneliner` polling, not by song metadata. The song database was never going to reduce that part. Separating the two is the whole point of the measurement below.

## The measurement

Add a small ledger that records every request that actually leaves for scenestream.net, plus every time a cache hit avoided one. With both sides recorded, the cache-hit ratio and the true upstream request rate become a single query.

### 1. Ledger table

New table `public.upstream_fetches`:

- `id`, `created_at`
- `endpoint` — `queue`, `oneliner`, `online`, `streams`, `song`, `artist`, `group`, `compilation`
- `entity_id` — song/artist id when applicable, null for list endpoints
- `outcome` — `fetched` (real upstream request), `cache` (served from DB, no upstream call), `claimed` (another client was already refreshing), `error`
- `source` — which function wrote the row (`xml-proxy` / `song-refresh`)
- `status` — upstream HTTP status when there was one

Written service-role only; no client writes. Read access limited the same way the existing telemetry tables are, so nothing user-identifying is exposed. Rows older than 30 days pruned probabilistically, matching the existing `stream-telemetry` pattern.

### 2. Instrument the two functions that actually talk upstream

- `xml-proxy`: one insert per request, classifying the path into an endpoint bucket, recording the upstream status. Fire-and-forget so it never slows or breaks the proxy.
- `song-refresh`: it already computes exactly the distinction we need — its existing `source` value (`cache`, `claimed-by-other`, `fetched`, `refreshed`) maps straight onto `outcome`. One insert per invocation.

### 3. Reporting view

`public.upstream_fetch_stats` — hourly buckets with, per endpoint: total calls, real upstream fetches, cache/claim avoidances, and hit ratio. That answers directly: "how many requests per hour are we sending to scenestream, and how many did the database prevent?"

## What this will tell us

Within a day of listening it will show, separately:

- Song metadata upstream rate — should be far below one fetch per song view if the DB-first path works, and near one-per-view if something is leaking.
- List-endpoint rate (`queue`/`oneliner`) — driven purely by the polling interval and the number of open tabs; the song DB has no effect here, and if total traffic is still high, this is almost certainly why.

If the second bucket dominates, the next lever is polling, not caching — for example a shared server-side queue snapshot so N listeners cost one upstream poll instead of N.

## Scope

One migration (table, grants, RLS, view), edits to `supabase/functions/xml-proxy/index.ts` and `supabase/functions/song-refresh/index.ts`. No client-side changes, no UI, no change to caching or playback behaviour.
