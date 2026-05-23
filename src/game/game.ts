import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";
import type { PlayerView, SequenceNode } from "./move.js";
import type { GameResult, Player } from "./player.js";

export interface Game<TState, TView extends PlayerView> {
  /**
   * Build the initial game state from the real `Player` instances. Receiving
   * the players directly (rather than just their ids) lets the game set up
   * cross-links such as `hand.player = p; p.hand = hand;`.
   */
  initialState(players: readonly Player<TView>[], rng: Rng): TState;
  /**
   * The game's high-level structure. Each entry is a phase the engine
   * runs in order; the only node type today is `player_turn_sequence`,
   * which round-robins through the players offering its `moves`. See
   * `SequenceNode` for the semantics of each phase.
   */
  readonly gameSequence: readonly SequenceNode<TState>[];
  isTerminal(state: TState): boolean;
  /** Valid only when `isTerminal(state)` is true. */
  result(state: TState): GameResult;
  /** Player-specific projection of the state (hides opponents' secrets). */
  viewFor(state: TState, viewerId: PlayerId): TView;
}
