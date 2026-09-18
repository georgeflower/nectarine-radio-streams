# Goose learning design

This document describes the deterministic, browser-local goose learning systems used to generate contextual chatter without external AI services.

## 1) Goals

The learning system is intended to:

- keep output playful but bounded and safe
- derive style from real oneliner traffic
- remain deterministic and lightweight
- avoid sending chat content to third-party model providers

## 2) Current two-layer model

The app uses two related learning paths.

### A) Phrase memory (`gooseLearnedPhrases.ts`)

Stores short sanitized phrase-level memories in local storage.

Key traits:

- line-level phrase capture
- frequency and recency tracking
- recent-user tracking for diversity
- weighted selection support
- emphatic trigger matching support

Storage key: `goose-learned-phrases`.

### B) Lexicon memory (`gooseLearnedLexicon.ts`)

Stores token/category-level data for recombination.

Key traits:

- tokenization and category tagging
- mood-aware selection weighting
- deterministic tie-breaking and bounded output
- template-based utterance assembly

Storage key: `goose-learned-lexicon-v1`.

## 3) Why phrase-only learning was not enough

Phrase-only memory is simple but limited:

- low recombination potential
- weak adaptation across similar but non-identical lines
- poor separation of style markers vs semantic fragments

The lexicon layer addresses this by learning reusable, typed fragments.

## 4) Lexicon categories and mood model

Token categories include:

- `greeting`
- `laughter`
- `wink`
- `heart`
- `hype`
- `farewell`
- `slang`
- `emphasis`
- `neutral`

Mood model (coarse):

- `calm`
- `friendly`
- `hype`
- `chaotic`
- `silly`

Mood is inferred from token/reaction heuristics and punctuation intensity patterns.

## 5) Selection and generation strategy

Each learned token tracks attributes such as:

- seen count
- last seen time
- distinct user set (bounded)
- style flags (caps/emoticon/punctuation/elongation signals)

Generation pipeline:

1. select target mood profile
2. score candidate tokens with frequency/recency/mood weighting
3. choose deterministic winners (stable tie handling)
4. assemble utterance from short templates
5. clamp/sanitize final output length and characters

## 6) Safety constraints

The learning path rejects or strips risky content patterns, including:

- URLs and token-like strings
- email-like material
- long numeric blobs
- oversized raw lines

Output is additionally constrained by:

- max token lengths
- bounded utterance length
- final sanitization pass before display

## 7) Persistence and corruption tolerance

Both learning stores are browser-local and bounded.

Resilience safeguards include:

- parse guards for invalid/corrupt stored payloads
- clamp logic for max token/user sizes
- deterministic fallback behavior when sparse data is present

This keeps learning robust without requiring backend state.

## 8) Integration points

Goose learning data can influence:

- reactive chatter in standard UI mode
- cracktro goose behavior
- oneliner-triggered micro-events and dialogue flavoring

Integration is intentionally additive and should not block core playback flows.

## 9) Test strategy

Relevant tests should validate:

- token/phrase extraction and safety filters
- categorization and mood inference heuristics
- learning updates for recency/frequency/user caps
- deterministic output shape under fixed inputs
- bounded string length and character sanitization

## 10) Future-safe extension principles

When extending goose learning:

1. preserve deterministic behavior
2. preserve offline/browser-local operation
3. keep strict safety filtering before persistence
4. version storage schemas explicitly
5. include migration/fallback behavior for schema changes
