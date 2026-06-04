# Goose learning design (non-AI)

## Current implementation (`gooseLearnedPhrases.ts`)

The current system is phrase-level and browser-local:

- learns sanitized short full-line phrases from oneliners
- stores in `localStorage` under `goose-learned-phrases`
- tracks `seen`, `lastSeenAt`, and recent `users`
- rejects obvious sensitive material (URLs, secrets, long numeric blobs)
- supports weighted phrase picking and emphatic trigger matching

This is deterministic and lightweight, but it treats each phrase as an indivisible unit.

## Limitations of whole-phrase learning

- low recombination power: learned strings are reused verbatim
- weak style transfer: punctuation/emoticon style not modeled separately
- sparse reuse: similar phrases with minor differences do not reinforce each other
- limited mood/context adaptation

## Proposal: lexicon-based non-AI system

Add a token lexicon that learns reusable short expressions and style markers from oneliners. Keep it deterministic and rules-based.

Implemented design artifact: `src/lib/gooseLearnedLexicon.ts`.

### Token categories

- `greeting`
- `laughter`
- `wink`
- `heart`
- `hype`
- `farewell`
- `slang`
- `emphasis`
- `neutral`

### Mood model

Coarse moods derived from recent lines:

- `calm`
- `friendly`
- `hype`
- `chaotic`
- `silly`

Mood is inferred with token/reaction heuristics and punctuation intensity signals.

### Weighted selection strategy

Each token stores:

- frequency (`seen`)
- recency (`lastSeenAt`)
- distinct users (`users`)
- style flags (e.g. `all-caps`, `emoticon`, `punct-heavy`, `elongated`)

Selection score combines these values plus mood-specific boosts, then chooses the best token deterministically (stable tie-breaking).

### Phrase template generation

Bird utterances are built from short templates such as:

- greeting + hype
- laughter + emphasis
- heart + neutral
- slang + hype

Fallback tokens are used when categories are sparse. Output is clipped and sanitized to stay short and safe.

### Safety rules

- no URL/email/token-like strings
- reject long numeric patterns and long raw lines
- keep token length capped
- keep generated output short (`maxLen`, default 48)
- strip unsafe characters before final output

### Persistence strategy

- `localStorage` key: `goose-learned-lexicon-v1`
- bounded token count (`MAX_TOKENS`)
- bounded per-token user list (`MAX_USERS_PER_TOKEN`)
- resilient parse + clamp behavior for corrupted/invalid stored data

## Suggested implementation steps

1. Learn lexicon on incoming oneliner events (white goose path first).
2. Blend lexicon output with existing goose dialogue/reaction systems.
3. Add optional mood-aware cracktro callbacks (overlay/scroller tweaks).
4. Add cooldowns per utterance template to avoid repetition.
5. Add migration path if storage schema evolves.

## Suggested tests

- tokenization filters URLs/secrets and keeps short expressive tokens
- category classification for hearts/laughter/winks/emphasis
- learning updates seen/recency/users and enforces caps
- mood derivation from curated recent line sets
- utterance builder outputs safe, bounded strings
