# bg-library

TypeScript primitives for board game simulation: decks, dice, hands, and a unified player/move interface that works for humans, scripted bots, and ML agents.

## Install

```bash
pnpm add bg-library
```

## Documentation

- [API reference](docs/api.md) — every exported type and class.

## Quick start

```ts
import { Deck, d6, Hand, mulberry32, runGame } from "bg-library";

const rng = mulberry32(42);

const deck = new Deck<string>(["A", "K", "Q", "J"], rng);
deck.shuffle();
const top = deck.draw(1);

const die = d6(rng);
die.roll();

const hand = new Hand<string>("alice", top);
hand.viewFor("alice"); // owner sees cards
hand.viewFor("bob");   // others see count only
```

## Design notes

- **Deterministic by default.** Every primitive that touches randomness takes an `Rng`. Seeding the same RNG produces identical games — essential for tests, replays, and reproducible bug reports.
- **Async player interface.** `Player.decide()` returns a `Promise`, so the same contract fits UI-driven humans, in-process bots, and remote/networked agents.
- **Per-viewer state views.** `Game.viewFor(state, viewerId)` returns a player-specific projection of the state; `Hand.viewFor(viewerId)` is the per-hand analogue (owner sees cards, others see count).
- **Move validation in the loop.** `runGame` rejects any move not present in `Game.legalMoves(...)` — moves from a player are never trusted blindly.

## Scripts

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Status

v0.1 — primitives only. No specific games or network transports.
