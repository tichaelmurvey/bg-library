import type { DealStrategy } from "../deck/deck.js";

/**
 * Library-wide defaults for primitive behaviors. Held by reference and
 * read fresh on every primitive call, so mutating fields here (e.g. on a
 * phase transition) takes effect on the next call without re-wiring.
 *
 * Holds defaults for primitives only — never game state (scores, turn
 * counters, phase enums). Those live in the game's `TState`.
 */
export interface GameConfig {
  /** Default strategy for `Deck.deal` when no per-call strategy is given. */
  dealStrategy?: DealStrategy;
}
