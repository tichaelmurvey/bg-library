# Notes for Claude

This file is auto-loaded by Claude Code. It's instructions to future-you (and other agents) working in this repo.

## Project overview

`bg-library` is a TypeScript library of board-game primitives — decks, dice, hands with visibility rules, and a unified `Player`/`Game`/`Move` contract. v0.1, primitives only. No specific games, no network transport.

Public surface is whatever [src/index.ts](src/index.ts) re-exports. If it isn't there, it isn't part of the API.

## Stack

- pnpm + TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- tsup → dual ESM/CJS + `.d.ts`
- vitest for tests
- Biome for lint/format

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # tsup → dist/
pnpm lint        # biome check src
```

All three of `typecheck`, `test`, `build` must pass before claiming a change is done.

## Design invariants — don't violate these

1. **Determinism.** Every primitive that uses randomness takes an `Rng` in its constructor. **Never** call `Math.random()` in `src/`. Seeded `mulberry32` is the only RNG impl; same seed → identical output. Tests rely on this.
2. **Async player interface.** `Player.decide()` returns `Promise<TMove>`. Don't add a synchronous variant — it would split the contract across humans/bots/remote agents.
3. **Move validation is the loop's job.** `runGame` checks the returned move against `Game.legalMoves` and throws `IllegalMoveError` on a mismatch. Never bypass this check.
4. **Per-viewer state projection.** Secret information is hidden via `Hand.viewFor(viewerId)` and `Game.viewFor(state, viewerId)`. Never pass full game state to a player; always go through `viewFor`.
5. **Game-agnostic library.** No specific games or game-rule helpers live in `src/`. Don't drift toward implementing card games or rulesets here — that's downstream.
6. **Prefabs are construction helpers only.** Anything under `src/prefabs/` MUST be a thin opinionated factory built on the primitives (e.g. `standardPlayingDeck`, `standardDiceSet`). No game-specific rules, no scoring, no win conditions — those belong downstream.

## Documentation — maintenance protocol

Docs live in two places: [readme.md](readme.md) (overview + quick start) and [docs/api.md](docs/api.md) (full API reference). Keep both files in sync with [src/index.ts](src/index.ts) — that file is the source of truth for the public surface.

### When to update docs

Treat any of these as a trigger to update `docs/api.md` (and `readme.md` if the quick-start is affected) **in the same change**:

- A new symbol is added to `src/index.ts` → document it.
- A symbol is removed from `src/index.ts` → delete its docs section.
- A signature changes (parameter list, return type, generic constraints) → update the signature block in `docs/api.md`.
- Observable behavior changes (throws differently, mutates vs. returns new, default values) → update the prose.
- A design invariant from the section above changes → update the readme's "Design notes" **and** this file's invariants list.

What does **not** need a doc update: internal refactors, private helpers, test-only changes, tooling tweaks that don't affect users.

### How to verify docs are in sync

Before finishing a doc-affecting change:

1. Read [src/index.ts](src/index.ts) and confirm every export appears in `docs/api.md`.
2. Read each section of `docs/api.md` and confirm the documented signatures match the actual ones in the source files.
3. If you changed an example, run it mentally against the current API — outdated examples are worse than no examples.

### Doc style

- One file per surface (`docs/api.md` covers everything). Don't fragment into many small files for a library this size — proliferation makes drift more likely.
- Lead with the signature, then a sentence on purpose, then a table for members or a code block for an example. Match the existing format.
- Prefer linking to source (e.g. `[src/deck/deck.ts](src/deck/deck.ts)`) over paraphrasing implementation details that may change.
- No emoji. No multi-paragraph prose for things a signature already conveys.
- Don't document internal/private helpers — only what's re-exported from `src/index.ts`.

### Don't create new doc files unless asked

If a user asks for "more documentation," default to expanding `docs/api.md` or `readme.md` rather than creating `CONTRIBUTING.md`, `ARCHITECTURE.md`, etc. Ask before adding new top-level doc files.

## Testing conventions

- Tests live next to the source: `src/foo/foo.ts` + `src/foo/foo.test.ts`.
- Use vitest's `describe`/`it`/`expect`. No other test framework.
- For anything random, construct a fresh `mulberry32(seed)` per test for reproducibility.
- The end-to-end smoke test lives in [src/game/game.test.ts](src/game/game.test.ts) and exercises Deck + Player + Game + runGame together. Keep it minimal — it's a smoke test, not a kitchen sink.

## File layout

```
src/
  index.ts            # public barrel — source of truth for the API surface
  rng/                # Rng interface + mulberry32
  card/               # Card<TAttrs> + CardAttribute discriminated union
  card-container/     # CardContainer interface + CardCollection
  config/             # GameConfig (primitive-default bag)
  deck/               # Deck<TCard>
  dice/               # Die, DicePool, factories (incl. d100 / PercentileDice)
  hand/               # Hand with per-viewer visibility
  game/               # Player, Move, Game, runGame, IllegalMoveError
  players/            # reusable Player implementations (e.g. random bot)
  prefabs/            # opinionated factories built on primitives
docs/api.md           # full API reference
readme.md             # overview + quick start
```

When adding a new primitive, follow the same pattern: its own subdir under `src/`, sibling test file, re-exported from `src/index.ts`, documented in `docs/api.md`.
