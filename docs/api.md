# API Reference

All exports are available from the root: `import { Deck, Die, ... } from "bg-library"`.

- [RNG](#rng)
- [CardContainer](#cardcontainer)
- [CardCollection](#cardcollection)
- [Card](#card)
- [Deck](#deck)
- [Dice](#dice)
- [Hand](#hand)
- [Game](#game)
- [GameConfig](#gameconfig)
- [Players](#players)
- [Prefabs](#prefabs)

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

## CardContainer

Source: [src/card-container/card-container.ts](../src/card-container/card-container.ts)

The shared surface of any object that holds a collection of cards. Both [`Deck`](#deck) and [`Hand`](#hand) implement `CardContainer<TCard>`.

```ts
interface CardContainer<TCard> {
  readonly size: number;
  add(card: TCard | readonly TCard[]): void;
  contains(predicate: (card: TCard) => boolean): boolean;
  remove(predicate: (card: TCard) => boolean): TCard | undefined;
  shuffle(): void;
  count<K extends AttrKey<TCard>>(field: K): Map<AttrValue<TCard, K>, number>;
}
```

| Member | Description |
| --- | --- |
| `size` | Number of cards currently in the container's primary collection. |
| `add(card \| cards)` | Add one or many cards. Insertion position is implementation-defined (see each class). |
| `contains(predicate)` | True if any card matches the predicate. |
| `remove(predicate)` | Remove and return the first matching card, or `undefined`. |
| `shuffle()` | Randomize order using the container's own `Rng`. |
| `count(field)` | Group held cards by the value of a named `Card` attribute and return a `Map<value, count>`. Cards missing the field (e.g. jokers when counting `"rank"`) are skipped. Field name and value type are derived from `TCard` via [`AttrKey` / `AttrValue`](#card); the method is unreachable on containers whose `TCard` isn't a `Card` (e.g. `Deck<number>`). |
| `valuesOf(field)` | Distinct attribute values present in the container, in first-seen iteration order. Cards missing the field are skipped. Equivalent to `[...count(field).keys()]` but skips the intermediate `Map`. |

```ts
const hand = new Hand<StandardPlayingCard>("alice", rng);
hand.add(deck.draw(7));
hand.count("rank");   // Map<number, number> — e.g. { 3 => 2, 7 => 1, 11 => 4 }
hand.count("suit");   // Map<Suit, number>
hand.valuesOf("rank"); // number[] — distinct ranks in first-seen order
```

Operations that are specific to one container — drawing, discarding, per-viewer visibility — live on the concrete classes, not on this interface.

---

## CardCollection

Source: [src/card-container/card-collection.ts](../src/card-container/card-collection.ts)

A shuffleable, mutable list of cards backed by an `Rng`. Used internally by both `Deck` and `Hand` so the shared mechanics — counting, predicate-based search and removal, shuffling, peeking from an end — live in one place. It is intentionally **position-explicit**: callers choose `addToEnd` vs. `addToStart` rather than the collection picking a default. The domain classes translate that into their own `add()` semantics.

For this reason `CardCollection` does **not** implement [`CardContainer`](#cardcontainer) — it has no opinion about which end `add` should target. It is exposed as a public primitive so downstream code can build other card containers on top of it.

### `class CardCollection<TCard>`

```ts
new CardCollection<TCard>(rng: Rng, initial?: readonly TCard[])
```

| Member | Description |
| --- | --- |
| `size` | Number of items. |
| `snapshot(): TCard[]` | Defensive copy of all items in underlying order. |
| `addToEnd(card \| cards)` | Append. |
| `addToStart(card \| cards)` | Prepend. |
| `contains(predicate)` | True if any item matches. |
| `remove(predicate): TCard \| undefined` | Remove the first matching item. |
| `shuffle()` | Randomize order using the collection's own `Rng`. |
| `peekFromEnd(n): readonly TCard[]` | Non-mutating look at the last `n` items (capped at `size`). |
| `takeFromEnd(n): TCard[]` | Remove and return the last `n` items in underlying order. Throws `RangeError` on underflow. |
| `replace(items: readonly TCard[])` | Wholesale-substitute the items. |
| `deal(containers, n)` | Distribute `n` cards to each container, round-robin from the end. See below. |

### `deal(containers, n)`

```ts
deal(containers: readonly CardContainer<TCard>[], n: number): void
```

Distribute `n` cards to each of the given containers, round-robin from the **end** of this collection (the "top," matching deck conventions). Each container receives cards via its own `add()` method — so a `Deck` target receives cards on the bottom of its draw pile, while a `Hand` target appends them.

Throws `RangeError` if:
- `n` is negative or non-integer
- `containers` is empty
- there are fewer than `n × containers.length` cards available

`n = 0` is a no-op.

---

## Card

Source: [src/card/card.ts](../src/card/card.ts)

A typed, introspectable card. `Card<TAttrs>` is `{ name, attrs }` — only `name` is library-required. Everything else lives in `attrs`, a keyed record of `CardAttribute`s. Each attribute carries its own `kind` discriminator so consumers can iterate, display, or compare attributes without external schema.

The pattern parallels [MoveParam](#param-kinds): a discriminated union with a small set of value-bearing shapes.

### `interface Card<TAttrs>`

```ts
interface Card<TAttrs extends CardAttrs = CardAttrs> {
  readonly name: string;
  readonly attrs: TAttrs;
}

type CardAttrs = Readonly<Record<string, CardAttribute>>;
```

Iterate uniformly with `Object.entries(card.attrs)`. Type-narrow concrete card shapes with `in` checks (e.g. `"rank" in card.attrs`).

### `type CardAttribute`

```ts
type CardAttribute = IntegerAttribute | DiscreteAttribute;
type AttributeKind = "integer" | "discrete";
```

| Kind | Shape | Notes |
| --- | --- | --- |
| `integer` | `{ kind: "integer"; value: number; min?: number; max?: number }` | Whole-number attribute (rank, cost, power). Bounds optional. |
| `discrete` | `{ kind: "discrete"; value: T; options: readonly T[] }` | Pick-one-of. `T extends string` narrows the value to a literal union when options are known. |

No runtime validation helper ships in v1 — cards are constructed in-process and trusted, unlike `MoveResponse` which comes from players. Add validation later if cards cross a serialization boundary.

### Type helpers: `AttrKey<TCard>` and `AttrValue<TCard, K>`

```ts
type AttrKey<TCard>   = TCard extends Card<infer A> ? Extract<keyof A, string> : never;
type AttrValue<TCard, K extends string> =
  TCard extends Card<infer A>
    ? K extends keyof A ? (A[K] extends { value: infer V } ? V : never) : never
    : never;
```

These distribute over unions, so a discriminated card union (`Card<X> | Card<Y>`) yields `AttrKey = keyof X | keyof Y` and `AttrValue<K>` is the union of value types across the branches that actually carry `K`. The `CardContainer.count` method uses both to type its argument and return value.

```ts
import type { Card, IntegerAttribute, DiscreteAttribute } from "bg-library";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type PlayingCard = Card<{
  rank: IntegerAttribute;
  suit: DiscreteAttribute<Suit>;
}>;

const aceOfSpades: PlayingCard = {
  name: "Ace of Spades",
  attrs: {
    rank: { kind: "integer", value: 1, min: 1, max: 13 },
    suit: { kind: "discrete", value: "spades", options: ["spades", "hearts", "diamonds", "clubs"] },
  },
};
```

---

## Deck

Source: [src/deck/deck.ts](../src/deck/deck.ts)

`Deck<TCard>` implements [`CardContainer<TCard>`](#cardcontainer). `contains` and `remove` operate on the draw pile only.

A discard pile is **another `Deck`**, linked by reference. Decks carry a stable `id` so paired decks can be re-linked after `toJSON` / `fromJSON`. Cards move between decks explicitly — e.g. `discard.add(main.draw(3))`.

### `class Deck<TCard>`

```ts
new Deck<TCard>(cards: readonly TCard[], rng: Rng, options?: DeckOptions<TCard>)
```

The last element of `cards` is the **top** of the deck (drawn first).

| Member | Description |
| --- | --- |
| `id: string` | Stable identifier. Auto-generated via `crypto.randomUUID()` when not supplied through `DeckOptions`. |
| `size` | Cards remaining in the draw pile. |
| `discardPile: Deck<TCard> \| undefined` | The linked discard pile, if any. Read-only getter. |
| `setDiscardPile(other \| undefined)` | Link a discard pile, or pass `undefined` to clear the link. |
| `shuffle()` | Shuffle the draw pile in place using the deck's `Rng`. |
| `draw(n = 1): TCard[]` | Draw `n` cards from the top. Throws `RangeError` on underflow. Top card is index 0 in the result. |
| `tryDraw(n): TCard[]` | Like `draw`, but returns up to `n` instead of throwing. |
| `peek(n = 1): readonly TCard[]` | Non-mutating look at the top `n` cards. |
| `add(card \| cards)` | Add one or many cards to the **bottom** of the draw pile. To send cards to the discard pile, call `add()` on the linked discard `Deck` directly. |
| `contains(predicate)` | True if any card in the draw pile matches. Does not search the discard pile. |
| `remove(predicate)` | Remove and return the first matching card from the draw pile. Does not search the discard pile. |
| `reshuffleDiscardIntoDeck()` | Drain the linked discard pile back into this deck and shuffle. `console.warn` and no-op if no discard pile is linked; silent no-op if the linked pile is empty. |
| `deal(targets, n, strategy?)` | Distribute `n` cards round-robin to each target `CardContainer`. See below. |
| `toJSON(): DeckSnapshot<TCard>` | Serialize current state (includes `id` and, when a discard pile is linked, `discardPileId`). |
| `static fromJSON(snap, rng): Deck` | Restore from snapshot. Discard-pile link is **not** auto-restored — callers re-link using the snapshot's `discardPileId`. |

### `interface DeckOptions<TCard>`

```ts
interface DeckOptions<TCard = unknown> {
  readonly id?: string;
  readonly discardPile?: Deck<TCard>;
  readonly config?: { dealStrategy?: DealStrategy };
}
```

| Field | Notes |
| --- | --- |
| `id` | Stable identifier for serialization linkage. Auto-generated via `crypto.randomUUID()` when omitted. |
| `discardPile` | Discard pile linked at construction. Equivalent to calling `setDiscardPile` immediately afterwards. |
| `config` | Held by reference and read fresh on every `deal()` call, so mutations made between calls (e.g. on a phase transition) are picked up immediately. The shape is structural — anything with an optional `dealStrategy` field works, and a [`GameConfig`](#gameconfig) is the canonical choice. |

### `deal(targets, n, strategy?)`

```ts
deal(
  targets: readonly CardContainer<TCard>[],
  n: number,
  strategy?: DealStrategy,
): void
```

Distribute `n` cards round-robin to each of the given targets, drawing from the **top** of the deck. Each target receives cards via its own `add()` method — so a `Hand` target appends, while a `Deck` target receives cards on the bottom of its draw pile.

Underflow handling resolves in this order:

1. The `strategy` argument, if given.
2. `options.config.dealStrategy`, if set.
3. `"exhaust"` (library default).

Throws `RangeError` if `n` is negative or non-integer, if `targets` is empty, or if the resolved strategy cannot satisfy the request (see `DealStrategy` below).

`n = 0` is a no-op.

### `type DealStrategy`

```ts
type DealStrategy = "full-rounds" | "exhaust" | "reshuffle";
```

| Strategy | Behavior |
| --- | --- |
| `"full-rounds"` | Deal only complete rounds: `min(n, floor(size / targets.length))`. Leftovers stay in the deck. Never throws on underflow. |
| `"exhaust"` | Deal round-robin until either `n` rounds are complete or the deck is empty. The final round may be partial. Never throws on underflow. |
| `"reshuffle"` | Deal `n` full rounds, draining the linked discard pile back into this deck whenever the draw pile is exhausted. Throws `RangeError` if there is no linked discard pile, or if both piles run dry before `n` rounds complete. |

### `interface DeckSnapshot<TCard>`

```ts
interface DeckSnapshot<TCard> {
  readonly id: string;
  readonly draw: readonly TCard[];
  readonly discardPileId?: string;
}
```

`discardPileId` carries the id of the linked discard deck at snapshot time. `fromJSON` restores the deck and its id but does not re-link the discard pile — the caller looks up the matching deck (e.g. by id in a registry of restored decks) and calls `setDiscardPile`.

```ts
// Linked main / discard, round-trip pattern:
const restored = new Map<string, Deck<Card>>();
for (const snap of snapshots) restored.set(snap.id, Deck.fromJSON(snap, rng));
for (const snap of snapshots) {
  if (snap.discardPileId) {
    restored.get(snap.id)?.setDiscardPile(restored.get(snap.discardPileId));
  }
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
| `flip(): TFace` | Alias for `roll()`. Reads naturally on coins (`coin.flip()`); available on every `Die` for uniformity. |
| `lastRoll: TFace \| undefined` | Result of the most recent roll. |
| `faceCount: number` | Number of distinct face slots (duplicates allowed). |

Throws `RangeError` if constructed with zero faces.

### Factories

```ts
numericDie(sides: number, rng: Rng): Die<number>
d4(rng), d6(rng), d8(rng), d10(rng), d12(rng), d20(rng)
d100(rng): PercentileDice
coin(rng): Die<"heads" | "tails">
```

### `interface PercentileDice`

```ts
interface PercentileDice {
  readonly tens: Die<number>;   // 1..10
  readonly ones: Die<number>;   // 1..10
  roll(): number;               // 1..100
}
```

A percentile-pair d100 modelled as two d10s. `roll()` returns `(tens - 1) * 10 + ones`, producing `1..100` inclusive (so `tens = 1, ones = 1 → 1` and `tens = 10, ones = 10 → 100`).

Rolling via `roll()` advances the shared `Rng` twice (tens then ones); rolling `tens` or `ones` directly advances it once.

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

`Hand<TCard>` implements [`CardContainer<TCard>`](#cardcontainer).

```ts
new Hand<TCard>(
  ownerId: PlayerId,
  rng: Rng,
  initial?: readonly TCard[],
  options?: HandOptions,
)
```

The `Rng` is required because `shuffle()` is part of the `CardContainer` contract. Most games never shuffle a hand, but constructing one with an `Rng` keeps the determinism invariant uniform across primitives.

| Member | Description |
| --- | --- |
| `ownerId: PlayerId` | The player who owns this hand. |
| `player: Player \| undefined` | Optional reference to the owning `Player`. Mutable so the game's `initialState` can wire up the symmetric `player.hand ⇄ hand.player` cross-link after both objects exist. |
| `isPrivate: boolean` | If `true` (default), only the owner sees the cards via `viewFor`; other viewers see only the count. If `false`, all viewers see the cards. |
| `size: number` | Number of cards held. |
| `add(card \| cards)` | Add one or many cards. |
| `contains(predicate)` | True if any card matches. |
| `remove(predicate): TCard \| undefined` | Remove and return the first card matching `predicate`. |
| `shuffle()` | Randomize the in-memory order of cards. Rarely needed in practice; provided for `CardContainer` uniformity. |
| `count(field)` / `valuesOf(field)` | Inherited from [`CardContainer`](#cardcontainer). |
| `viewFor(viewerId): HandView<TCard>` | Per-viewer projection — visibility honors `isPrivate`. |
| `reveal(): readonly TCard[]` | God-mode access for game logic. Bypasses visibility. |

### `interface HandOptions`

```ts
interface HandOptions {
  readonly player?: Player<PlayerView>;
  readonly isPrivate?: boolean;  // default true
}
```

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

The Player/Move/Game contract is the unified interface for human, scripted, and machine agents. Instead of enumerating every legal move, a game presents a structured **offering** that describes the action space; the player picks an option and fills in typed params.

### `type PlayerView = Readonly<Record<string, unknown>>`

A player-specific projection of game state. Shape is defined by each game.

### Move offering

A `MoveOffering` is what the game presents to a player on their turn. It has two layers: the list of available move types (`MoveOption`), and for each, the list of params the player must fill in (`MoveParam`).

```ts
interface MoveOffering {
  readonly options: readonly MoveOption[];
}

interface MoveOption {
  readonly type: string;             // e.g. "draw", "play", "pass"
  readonly label?: string;           // optional human display
  readonly params: readonly MoveParam[];
}
```

### Param kinds

`MoveParam` is a discriminated union — `kind` selects the variant. Every variant carries a unique `name` within its option.

```ts
type ParamKind = "binary" | "number-range" | "named-options" | "string";

interface BinaryParam {
  readonly name: string;
  readonly kind: "binary";
  readonly trueLabel?: string;       // e.g. "forward"
  readonly falseLabel?: string;      // e.g. "back"
}

interface NumberRangeParam {
  readonly name: string;
  readonly kind: "number-range";
  readonly min: number;
  readonly max: number;
  readonly step?: number;            // defaults to 1
}

interface NamedOptionsParam {
  readonly name: string;
  readonly kind: "named-options";
  readonly options: readonly string[]; // e.g. ["up", "down", "left", "right"]
}

interface StringParam {
  readonly name: string;
  readonly kind: "string";
  readonly maxLength: number;
  readonly minLength?: number;
}
```

| Kind | Response value type | Constraints |
| --- | --- | --- |
| `binary` | `boolean` | None beyond type. Labels are display-only. |
| `number-range` | `number` (finite) | `min ≤ value ≤ max`, aligned to `step` from `min`. |
| `named-options` | `string` | Must be a member of `options`. |
| `string` | `string` | `minLength ≤ length ≤ maxLength`. |

`MoveParamValue = boolean | number | string` is the union of all response value types.

### Move response

A player's reply to an offering.

```ts
interface MoveResponse {
  readonly type: string;             // must match one MoveOption.type
  readonly params: Readonly<Record<string, MoveParamValue>>;
}
```

The `params` record is keyed by `MoveParam.name`. Every param declared by the chosen option must be present; no extra keys are allowed.

### `validateMoveResponse(offering, response): ValidationResult`

Structural check that a response is well-formed against an offering. Returns:

```ts
type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };
```

`runGame` calls this on every move and throws `IllegalMoveError` if it fails. Games may also call it directly when validating responses received from outside the loop (e.g. over the network).

### Moves: `PlayerMove`, `GameMove`, `Move`

Game rules are described by a list of moves rather than by hand-written `moveOffering` / `applyMove` switches. Each move is a self-contained unit that knows both how to present itself and how to apply.

```ts
type Move<TState> = PlayerMove<TState> | GameMove<TState>;

interface PlayerMove<TState> {
  readonly kind: "player";
  readonly type: string;
  /** Build the move's option, or return null if not currently legal. */
  offer(state: TState, playerId: PlayerId): PlayerMoveOffer | null;
  apply(
    state: TState,
    params: Readonly<Record<string, MoveParamValue>>,
    ctx: MoveContext,
  ): MoveResult<TState>;
}

interface GameMove<TState> {
  readonly kind: "game";
  readonly type: string;
  /** Invoked only via another move's `triggers`. Never offered to players. */
  apply(
    state: TState,
    params: Readonly<Record<string, MoveParamValue>>,
    ctx: MoveContext,
  ): MoveResult<TState>;
}

interface PlayerMoveOffer {
  readonly label?: string;
  readonly params: readonly MoveParam[];
}

interface MoveResult<TState> {
  readonly state: TState;
  /** Follow-up moves run depth-first before the loop yields to the next player turn. */
  readonly triggers?: readonly TriggeredMove[];
}

interface TriggeredMove {
  readonly type: string;
  readonly params?: Readonly<Record<string, MoveParamValue>>;
}

interface MoveContext {
  readonly actingPlayerId?: PlayerId;   // undefined for engine-driven moves
  readonly triggeredBy?: string;        // undefined on the chain's entrypoint
  readonly rng: Rng;
  /** Force the enclosing player_turn_sequence to advance after the chain settles. */
  advanceTurn(): void;
}
```

`actingPlayerId` is set on every move run inside a `player_turn_sequence` (player-chosen and triggered alike). It is **undefined** for moves run as standalone entries in `gameSequence` (e.g. an `initial-deal` setup move). `ctx.advanceTurn()` is a no-op outside a `player_turn_sequence`.

For convenience, `PlayerMove.apply` receives a narrowed **`PlayerMoveContext`** where `actingPlayerId` is required:

```ts
interface PlayerMoveContext extends Omit<MoveContext, "actingPlayerId"> {
  readonly actingPlayerId: PlayerId;   // narrowed: required
}
```

The engine guarantees this — player-moves only run inside a `player_turn_sequence`. Game-move authors keep the looser `MoveContext` because game-moves can also run in engine chains (e.g. triggered from an `initial-deal` move) where no player is on turn.

`PlayerMove.offer` is called for every player-move on every player turn. Returning `null` excludes the move from the offering. State-derived option lists (e.g. "rank must be a value you already hold") fall out naturally — derive them inside `offer` from the current state and player.

`MoveResult.triggers` references other moves by `type`. Only `GameMove`s can be triggered. Triggered moves run **depth-first**: if `A.apply` returns triggers `[B, C]`, the engine runs `B`, then any triggers `B` produces (and theirs, recursively), then `C`. The whole chain settles before the loop asks for the next player's move.

### `interface Player<TView>`

```ts
interface Player<TView extends PlayerView> {
  readonly id: PlayerId;
  hand?: Hand<unknown>;
  decide(view: TView, offering: MoveOffering): Promise<MoveResponse>;
  onGameStart?(view: TView): void | Promise<void>;
  onMoveApplied?(view: TView, applied: AppliedMove): void | Promise<void>;
  onGameEnd?(view: TView, result: GameResult): void | Promise<void>;
}
```

`decide` is async so the same contract fits humans (UI input), in-process bots, and remote/ML agents. The response is validated by the loop before being applied.

`onMoveApplied` fires after **every** applied move — the player-chosen move and each game-triggered follow-up. Inspect `applied.triggeredBy` to tell them apart.

`hand` is optional and intentionally typed as `Hand<unknown>` — it's a back-reference that lets `player.hand` ⇄ `hand.player` form a symmetric cross-link. Game code typically operates on its own strongly-typed `state.hands` array rather than dereferencing `player.hand`, so the loose typing is rarely felt at use sites.

### `interface AppliedMove`

A record of a move that the engine actually applied. Stored in `GameRunResult.history` and passed to `Player.onMoveApplied`.

```ts
interface AppliedMove {
  readonly type: string;
  readonly params: Readonly<Record<string, MoveParamValue>>;
  readonly playerId: PlayerId;    // who was on turn when this fired
  readonly triggeredBy?: string;  // the move type that triggered this one; absent on player-chosen moves
}
```

### `interface GameResult`

```ts
interface GameResult {
  readonly winners: readonly PlayerId[];
  readonly scores?: Readonly<Record<PlayerId, number>>;
  readonly reason?: string;
}
```

### `interface Game<TState, TView>`

```ts
interface Game<TState, TView extends PlayerView> {
  initialState(players: readonly Player<TView>[], rng: Rng): TState;
  readonly gameSequence: readonly SequenceNode<TState>[];
  isTerminal(state: TState): boolean;
  result(state: TState): GameResult;     // valid only when isTerminal
  viewFor(state: TState, viewerId: PlayerId): TView;
}
```

`gameSequence` is the game's high-level structure: an ordered list of phases the engine runs in turn. The only node type today is `player_turn_sequence` — see below.

`initialState` receives the real `Player` instances (not just their ids) so the game can wire up cross-links such as `hand.player = p; p.hand = hand;`.

There is no `currentPlayer` method — the sequence node owns the turn cursor.

### Sequence nodes

```ts
type SequenceNode<TState> = PlayerTurnSequence<TState> | GameMove<TState>;

interface PlayerTurnSequence<TState> {
  readonly type: "player_turn_sequence";
  readonly moves: readonly Move<TState>[];
}
```

A `gameSequence` entry is either a structured sub-phase (today just `PlayerTurnSequence`) or a bare `GameMove` that the engine runs once. Inline game-moves are convenient for setup or teardown — e.g. an initial-deal move placed before the player turn sequence:

```ts
gameSequence: [
  initialDealMove,                                     // engine runs this once
  { type: "player_turn_sequence", moves: [...] },      // then player turns begin
]
```

Inline moves must be `kind: "game"` (player-moves only make sense inside a `player_turn_sequence`). Their `apply` runs with `ctx.actingPlayerId === undefined`, and any triggers chain normally against the global move catalog (collected from every node).

**`player_turn_sequence`** iterates the players round-robin. For each player:

1. The engine calls `offer` on every player-move in `moves`, builds an offering from the non-null results.
2. If the offering is empty, the player is skipped and the cursor advances. When every player has been skipped consecutively, the phase exits.
3. Otherwise the player decides; the chosen move's `apply` runs and its triggers chain depth-first.
4. After the chain settles, the cursor either:
   - **advances** if any move during the chain called `ctx.advanceTurn()`, or
   - **stays on the same player** otherwise — they get another offering on the next iteration. If their offering is now empty, the skip-and-advance branch above handles it.

This means moves don't need an explicit "end turn" trigger when a player runs out of legal options (the engine notices), but they *do* need `ctx.advanceTurn()` for rules-driven pass-the-turn cases (e.g. Go Fish: missing a fish ends the turn even though the player still has playable cards).

The phase also exits whenever `isTerminal(state)` becomes true.

### `runGame(game, players, rng): Promise<GameRunResult<TState>>`

```ts
function runGame<TState, TView extends PlayerView>(
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  rng: Rng,
): Promise<GameRunResult<TState>>;

interface GameRunResult<TState> {
  readonly result: GameResult;
  readonly finalState: TState;
  /** Every applied move in order — player moves and triggered game moves alike. */
  readonly history: readonly AppliedMove[];
}
```

The loop:
1. Calls `onGameStart` on every player.
2. Walks `game.gameSequence` in order. Each entry is a sequence node; the engine runs it via the appropriate handler (today only `player_turn_sequence`). A node runs until it self-exits or `isTerminal(state)` fires.
3. Inside a `player_turn_sequence`, each player turn:
   - Builds the offering by calling `offer(state, currentId)` on every `kind: "player"` move in the node.
   - Asks the player to `decide`, validates the response with `validateMoveResponse`.
   - Runs the chosen player-move's `apply`, then walks its `triggers` depth-first — each triggered game-move runs through `apply`, records its `AppliedMove` in `history`, and notifies every player via `onMoveApplied`. Triggers a triggered move produces are themselves processed before the next sibling trigger.
   - Advances the cursor if any move called `ctx.advanceTurn()` during the chain; otherwise stays on the same player for the next iteration.
4. Calls `onGameEnd` and returns the final result.

### `class IllegalMoveError`

Thrown when a player's response fails validation.

```ts
class IllegalMoveError extends Error {
  readonly playerId: PlayerId;
  readonly move: MoveResponse;
  readonly reason: string;            // from ValidationResult
}
```

---

## GameConfig

Source: [src/config/game-config.ts](../src/config/game-config.ts)

Library-wide defaults for primitive behaviors. A single `GameConfig` object is constructed once and passed by reference to any primitive that accepts it. Primitives read it fresh on each call, so mutating fields here (e.g. on a phase transition inside `applyMove`) takes effect on the next call without re-wiring anything.

```ts
interface GameConfig {
  dealStrategy?: DealStrategy;
}
```

| Field | Used by | Default when unset |
| --- | --- | --- |
| `dealStrategy` | [`Deck.deal`](#dealtargets-n-strategy) | `"exhaust"` |

### What belongs here vs. in `TState`

`GameConfig` holds **defaults for primitives**: how a deck deals when it runs short, how a die rerolls, etc. It is *not* a place to put game state.

| Lives in `GameConfig` (mutable, shared) | Lives in `TState` (immutable, threaded by `runGame`) |
| --- | --- |
| `dealStrategy` | scores, turn counter, phase enum |
| future primitive-default fields | board layout, who holds what |

Per-call arguments always win over `GameConfig`, which always wins over the library default. Phase transitions should *write* to the config (`config.dealStrategy = "reshuffle"`); they should never be *readable* from it as game state.

### Example

```ts
import { Deck, mulberry32, type GameConfig } from "bg-library";

const config: GameConfig = { dealStrategy: "full-rounds" };
const deck = new Deck<number>([1, 2, 3, 4, 5, 6, 7], mulberry32(42), { config });

deck.deal(hands, 3);              // full-rounds (from config)
deck.deal(hands, 3, "exhaust");   // per-call override wins
config.dealStrategy = "reshuffle";
deck.deal(hands, 3);              // reshuffle (live mutation picked up)
```

---

## Players

Source: [src/players/](../src/players/)

Ready-to-use `Player` implementations. Game-agnostic — each is generic over `TView` so you can drop them into any game.

### `randomBot<TView>(id, rng): Player<TView>`

Source: [src/players/random/random.ts](../src/players/random/random.ts)

```ts
function randomBot<TView extends PlayerView>(id: PlayerId, rng: Rng): Player<TView>;
```

Picks a uniformly-random *legal* move from each offering. Useful as a placeholder opponent, baseline benchmark, or smoke test. Per-param behavior:

| Kind | Behavior |
| --- | --- |
| `named-options` | Uniform random pick from `options`. |
| `number-range` | Uniform random value in `[min, max]`, aligned to `step`. |
| `binary` | Uniform random boolean. |
| `string` | The empty string. |

Throws if the offering has no options, or if a `named-options` param has an empty `options` array.

Randomness is fully driven by the provided `Rng`, so the same seed produces the same sequence of decisions. Fork from a parent `Rng` (`rng.fork()`) when you want per-bot streams that don't perturb each other.

```ts
import { mulberry32, randomBot, runGame } from "bg-library";

const rng = mulberry32(42);
const players = ["alice", "bob"].map((id) => randomBot<MyView>(id, rng.fork()));
const result = await runGame(myGame, players, rng);
```

---

## Prefabs

Source: [src/prefabs/](../src/prefabs/)

Opinionated factories built on top of the primitives. Each prefab is a *thin* convenience layer — it constructs primitives with sensible defaults so callers can skip the boilerplate when building a simulation. Prefabs MUST NOT contain game-specific rules; only construction helpers.

### `standardDiceSet(rng): StandardDiceSet`

Source: [src/prefabs/standard-dice-set.ts](../src/prefabs/standard-dice-set.ts)

```ts
interface StandardDiceSet {
  readonly d4: Die<number>;
  readonly d6: Die<number>;
  readonly d8: Die<number>;
  readonly d10: Die<number>;
  readonly d12: Die<number>;
  readonly d20: Die<number>;
  readonly d100: PercentileDice;
}
```

The canonical tabletop set. All dice share the given `Rng`, so the *order* of rolls across the set determines the sequence (matching how `Deck` and `Hand` share an `Rng`). For independent streams per die, give each one a forked `Rng` and construct dice manually instead.

```ts
import { standardDiceSet, mulberry32 } from "bg-library";

const dice = standardDiceSet(mulberry32(42));
dice.d20.roll();    // 1..20
dice.d100.roll();   // 1..100
```

### `standardPlayingDeck(rng, opts?): Deck<StandardPlayingCard>`

Source: [src/prefabs/standard-playing-deck.ts](../src/prefabs/standard-playing-deck.ts)

```ts
function standardPlayingDeck(
  rng: Rng,
  opts?: { jokers?: boolean },
): Deck<StandardPlayingCard>;
```

Builds a fresh 52-card deck (or 54 with `{ jokers: true }`). The returned deck is **not** pre-shuffled — call `deck.shuffle()` for randomized order. This matches the explicit-randomness convention used elsewhere in the library.

The element type is a union over two `Card` shapes, each intersected with `PlayingCardOps`:

```ts
type StandardPlayingCard =
  | (Card<{
      readonly rank: IntegerAttribute;            // value 1..13
      readonly suit: DiscreteAttribute<Suit>;
    }> & PlayingCardOps)
  | (Card<{
      readonly joker: DiscreteAttribute<"red" | "black">;
    }> & PlayingCardOps);

interface PlayingCardOps {
  rankOf(): number | undefined;     // 1..13 for suited cards, undefined for jokers
  rankNameOf(): RankName | undefined; // "Ace".."King" for suited, undefined for jokers
}

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type RankName = "Ace" | "Two" | ... | "King";
```

Narrow the union with `"joker" in card.attrs`. The matching rank-name strings (`"Ace"`..`"King"`) are exported as the readonly tuple `RANK_NAMES`, indexed by `rank - 1`. `SUITS` and `JOKER_COLORS` are similarly exported.

The `rankOf` / `rankNameOf` accessors are convenience methods present on every card in the deck so callers don't need to write the `"joker" in attrs` guard each time they want a rank. They are closure-bound at construction; this means cards do not survive a `JSON.stringify` round-trip unmodified — rebuild them through `standardPlayingDeck` (or re-attach the methods) after deserialization.

```ts
import { standardPlayingDeck, RANK_NAMES, mulberry32 } from "bg-library";

const deck = standardPlayingDeck(mulberry32(1), { jokers: true });
deck.shuffle();
deck.size;  // 54

const card = deck.draw(1)[0];
card.rankOf();      // 1..13, or undefined for a joker
card.rankNameOf();  // "Ace".."King", or undefined for a joker
if ("joker" in card.attrs) {
  card.attrs.joker.value;   // "red" | "black"
} else {
  card.attrs.rank.value;    // 1..13
  card.attrs.suit.value;    // "spades" | ...
  card.name;                // e.g. "Queen of hearts"
}
```

### Coin

The existing `coin(rng): Die<"heads" | "tails">` factory is the "flippable coin" prefab. With `Die.flip()` available as an alias for `roll()`, the natural verb reads as expected:

```ts
import { coin, mulberry32 } from "bg-library";

const c = coin(mulberry32(1));
c.flip();   // "heads" | "tails"
```
