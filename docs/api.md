# API Reference

All exports are available from the root: `import { Deck, Die, ... } from "bg-library"`.

- [RNG](#rng)
- [Deck](#deck)
- [Dice](#dice)
- [Hand](#hand)
- [Game](#game)

---

## RNG

Source: [src/rng/](../src/rng/)

Every primitive that uses randomness takes an `Rng` so games are deterministic and replayable.

### `interface Rng`

```ts
interface Rng {
  next(): number;                    // [0, 1)
  int(maxExclusive: number): number; // [0, maxExclusive)
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[]; // returns a new array
  fork(): Rng;                          // independent stream
}
```

### `mulberry32(seed: number): Rng`

A small, fast, deterministic PRNG. Same `seed` → same sequence.

```ts
import { mulberry32 } from "bg-library";

const rng = mulberry32(42);
rng.next();          // 0.something
rng.int(6);          // 0..5
rng.pick(["a","b"]); // "a" | "b"
```

`fork()` returns a child `Rng` seeded from the parent. Use it when a sub-system needs its own stream that won't be perturbed by the parent's other random calls.

---

## Deck

Source: [src/deck/deck.ts](../src/deck/deck.ts)

### `class Deck<TCard>`

```ts
new Deck<TCard>(cards: readonly TCard[], rng: Rng)
```

The last element of `cards` is the **top** of the deck (drawn first).

| Member | Description |
| --- | --- |
| `size` | Cards remaining in the draw pile. |
| `discardSize` | Cards in the discard pile. |
| `shuffle()` | Shuffle the draw pile in place using the deck's `Rng`. |
| `draw(n = 1): TCard[]` | Draw `n` cards from the top. Throws `RangeError` on underflow. Top card is index 0 in the result. |
| `tryDraw(n): TCard[]` | Like `draw`, but returns up to `n` instead of throwing. |
| `peek(n = 1): readonly TCard[]` | Non-mutating look at the top `n` cards. |
| `discard(card \| cards)` | Push one or many cards to the discard pile. |
| `reshuffleDiscardIntoDeck()` | Move discard back onto the draw pile and shuffle. |
| `toJSON(): DeckSnapshot<TCard>` | Serialize current state. |
| `static fromJSON(snap, rng): Deck` | Restore from snapshot. |

### `interface DeckSnapshot<TCard>`

```ts
interface DeckSnapshot<TCard> {
  readonly draw: readonly TCard[];
  readonly discard: readonly TCard[];
}
```

---

## Dice

Source: [src/dice/](../src/dice/)

### `class Die<TFace = number>`

```ts
new Die<TFace>(faces: readonly TFace[], rng: Rng)
```

| Member | Description |
| --- | --- |
| `roll(): TFace` | Roll the die and update `lastRoll`. |
| `lastRoll: TFace \| undefined` | Result of the most recent roll. |
| `faceCount: number` | Number of distinct face slots (duplicates allowed). |

Throws `RangeError` if constructed with zero faces.

### Factories

```ts
numericDie(sides: number, rng: Rng): Die<number>
d4(rng), d6(rng), d8(rng), d10(rng), d12(rng), d20(rng)
coin(rng): Die<"heads" | "tails">
```

### `class DicePool<TFace = number>`

```ts
new DicePool<TFace>(dice: readonly Die<TFace>[])
```

| Member | Description |
| --- | --- |
| `size` | Number of dice in the pool. |
| `results: readonly TFace[]` | Most recent roll results. Empty until `rollAll()` has been called. |
| `rollAll(): TFace[]` | Roll every die, store and return results. |
| `reroll(indices: readonly number[]): TFace[]` | Reroll only the dice at the given indices. Must be called after `rollAll()`. Throws `RangeError` for out-of-range indices. |

Modifiers (add bonuses, "highest N of M", etc.) are intentionally not in the pool — they're game-specific. Compose on top.

---

## Hand

Source: [src/hand/hand.ts](../src/hand/hand.ts)

### `type PlayerId = string`

### `class Hand<TCard>`

```ts
new Hand<TCard>(ownerId: PlayerId, initial?: readonly TCard[])
```

| Member | Description |
| --- | --- |
| `ownerId: PlayerId` | The player who owns (and can see) this hand. |
| `size: number` | Number of cards held. |
| `add(card \| cards)` | Add one or many cards. |
| `remove(predicate): TCard \| undefined` | Remove and return the first card matching `predicate`. |
| `viewFor(viewerId): HandView<TCard>` | Per-viewer projection — owner sees cards, others see count only. |
| `reveal(): readonly TCard[]` | God-mode access for game logic. Bypasses visibility. |

### `interface HandView<TCard>`

```ts
interface HandView<TCard> {
  readonly ownerId: PlayerId;
  readonly count: number;
  readonly cards: readonly TCard[] | undefined; // undefined when hidden
}
```

`cards` is `undefined` (not `[]`) when the viewer is not the owner — distinguishing "hidden" from "empty."

---

## Game

Source: [src/game/](../src/game/)

The Player/Move/Game contract is the unified interface for human, scripted, and machine agents.

### `type Move = Readonly<Record<string, unknown>>`

Move shapes are defined by each game. The library only requires that moves are plain serializable objects so they can cross a network or be logged for replay.

### `type PlayerView = Readonly<Record<string, unknown>>`

Same idea for what a player sees on their turn — game-specific, but the library treats it as opaque.

### `interface Player<TView, TMove>`

```ts
interface Player<TView extends PlayerView, TMove extends Move> {
  readonly id: PlayerId;
  decide(view: TView, legalMoves: readonly TMove[]): Promise<TMove>;
  onGameStart?(view: TView): void | Promise<void>;
  onMoveApplied?(view: TView, move: TMove, byPlayer: PlayerId): void | Promise<void>;
  onGameEnd?(view: TView, result: GameResult): void | Promise<void>;
}
```

`decide` is async to accommodate humans (waiting on UI), bots (sync), and networked/ML agents (HTTP). The returned move **must** be one of the entries in `legalMoves` — otherwise `runGame` throws `IllegalMoveError`.

### `interface GameResult`

```ts
interface GameResult {
  readonly winners: readonly PlayerId[];
  readonly scores?: Readonly<Record<PlayerId, number>>;
  readonly reason?: string;
}
```

### `interface Game<TState, TView, TMove>`

```ts
interface Game<TState, TView extends PlayerView, TMove extends Move> {
  initialState(playerIds: readonly PlayerId[], rng: Rng): TState;
  currentPlayer(state: TState): PlayerId;
  isTerminal(state: TState): boolean;
  result(state: TState): GameResult;             // valid only when isTerminal
  legalMoves(state: TState, playerId: PlayerId): readonly TMove[];
  applyMove(state: TState, move: TMove, playerId: PlayerId): TState;
  viewFor(state: TState, viewerId: PlayerId): TView;
  movesEqual?(a: TMove, b: TMove): boolean;      // defaults to JSON-string equality
}
```

`applyMove` should be pure-ish: prefer returning a new state rather than mutating the input. The loop carries the returned state forward.

### `runGame(game, players, rng): Promise<GameRunResult>`

```ts
function runGame<TState, TView, TMove>(
  game: Game<TState, TView, TMove>,
  players: readonly Player<TView, TMove>[],
  rng: Rng,
): Promise<GameRunResult<TState, TMove>>;

interface GameRunResult<TState, TMove> {
  readonly result: GameResult;
  readonly finalState: TState;
  readonly history: readonly { readonly playerId: PlayerId; readonly move: TMove }[];
}
```

The loop:
1. Calls `onGameStart` on every player.
2. While `!isTerminal(state)`: gets the current player, asks them to `decide`, validates the move against `legalMoves` (via `movesEqual`), applies it, and notifies all players via `onMoveApplied`.
3. Calls `onGameEnd` and returns the final result.

### `class IllegalMoveError`

Thrown when a player returns a move not in the legal move set.

```ts
class IllegalMoveError extends Error {
  readonly playerId: PlayerId;
  readonly move: Move;
}
```
