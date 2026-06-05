# Plan

## 1. Volume bar in front of info windows (main page)
- `AudioPlayer.tsx` line ~531: the volume popup uses `z-20` but sits inside a panel that creates a stacking context, so the BoingBall / floating widgets render on top.
- Fix by rendering the popup at a much higher layer:
  - Bump the popup wrapper to `z-[100]`.
  - Wrap the AudioPlayer container in a relative element with `isolation: isolate` only when popup is closed, or simply add `style={{ position: "relative", zIndex: 60 }}` to the outer `.panel` div of AudioPlayer so its descendants outrank the boing ball (`zIndex 6`) and any FloatingWindow/panels on the page.

## 2. Boing ball in front of info windows in cracktro
- `BoingBall.tsx` line 316: `zIndex: 6`.
- `FloatingWindow.tsx` line 87: `zIndex: 12` — that's why oneliner/online/queue/history windows cover the ball.
- Raise the boing ball's `zIndex` to `20` (above FloatingWindow `12` and settings bar `11`, below the fullscreen overlay chrome which is fine since chrome is interactive). Keep it below the cracktro settings expanded panel? Settings is `zIndex 11`, so 20 is fine.

## 3. More bird chatter between play-with-ball and feeding
- `gooseSocial.ts`:
  - During `runFlyAway` "eating" loop (lines 460-477): currently 1 line every ~2.4s for 20s. Extend with a much larger pool sourced from the existing dialogue corpus.
  - Add a new shared `CHATTER_POOL` (~500 short lines) — assemble by combining existing `FOOD_EAT_LINES`, `LONELY_LINES`, `FOOD_RESUME_LINES`, scene/era dialogues from `gooseDialogues.ts`, and reaction responses. Deduplicate, cap at 500.
  - Use `pickUsageTracked("chatter-pool", CHATTER_POOL)` to avoid repeats.
  - Insert short interstitial chatter:
    - Between ball-play end and next activity: append a 2-3 line exchange in `runBallPlay` finally block (before clearing).
    - Between feeding return and resume: extend the eat loop to also include lonely partner reactions.
  - Make the eat loop alternate both geese with chatter pool lines and double its duration ceiling.

## 4. Longer interval between feedings
- `gooseSocial.ts` line 492: `lastFlyAwayAt > 240_000` (4 min) and 25% chance per step.
- Change to `> 540_000` (9 min) and lower probability to `0.15`.
- Also raise `MIN_EAT_MS` from 20s to 35s so the snack itself feels more leisurely (this complements #3).

## 5. Cloud-shared learned lingo (low cost)
Goal: aggregate the lexicon/phrases from `gooseLearnedLexicon.ts` + `gooseLearnedPhrases.ts` across users using Lovable Cloud, staying inside the free tier.

### Schema (one small table)
```sql
create table public.goose_lexicon (
  token text primary key,
  category text not null,
  seen int not null default 1,
  last_seen_at timestamptz not null default now(),
  style_flags text[] default '{}'
);
```
- Public read (`grant select to anon`), insert/update via an edge function only (so we can rate-limit + sanitize server-side).
- Add a tiny `goose_phrases` table with the same pattern for whole-phrase learning (optional second step).

### Edge function `goose-lexicon-sync`
- POST: accepts up to N (e.g. 20) sanitized tokens per call, runs the same `SENSITIVE_RE` / length guards server-side, upserts with `seen = seen + 1`, updates `last_seen_at`.
- GET: returns top ~500 tokens by recency+frequency.

### Client integration
- In `gooseLearnedLexicon.ts`:
  - After `learnLexiconFromOneliner`, queue new tokens in memory.
  - Debounced flush (every ~60s, or when queue ≥ 10) calls the edge function POST.
  - On app boot, fetch GET once and merge results into the local lexicon (local entries win for recency, cloud contributes breadth).
- Same pattern for phrases if we add that table.

### Cost control (stay free)
- Debounce + batch (≤ ~1 POST/min/user).
- Cap payload at 20 tokens × ~30 chars = tiny rows.
- Single GET per session (cached in `localStorage` with 1h TTL).
- Sanitize server-side to reject URLs, emails, secrets, long numerics, anything > 32 chars.
- Hard table size cap via a daily cron-style cleanup (delete rows where `last_seen_at < now() - interval '60 days'` and `seen < 2`) — implemented as a SQL function called from the same edge function on a probabilistic basis (1% of writes trigger cleanup) so we don't need pg_cron.

No external API, no storage buckets, no realtime channels — just one table + one edge function. Well within the included Lovable Cloud quota.

## Technical notes
- Files touched: `src/components/AudioPlayer.tsx`, `src/components/BoingBall.tsx`, `src/lib/gooseSocial.ts`, `src/lib/gooseLearnedLexicon.ts`, new `supabase/functions/goose-lexicon-sync/index.ts`, new migration for `goose_lexicon` table with GRANTs and RLS.
- No changes to `Cracktro.tsx` settings UI.
- Existing tests still pass; add a small unit test for the chatter pool size (≥ 500) and for the debounced flush queue.
