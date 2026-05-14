import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";
import type { MoveOffering, MoveResponse, PlayerView } from "./move.js";
import type { GameResult } from "./player.js";

export interface Game<TState, TView extends PlayerView> {
  initialState(playerIds: readonly PlayerId[], rng: Rng): TState;
  currentPlayer(state: TState): PlayerId;
  isTerminal(state: TState): boolean;
  /** Valid only when `isTerminal(state)` is true. */
  result(state: TState): GameResult;
  /** The set of moves the given player may make from the current state. */
  moveOffering(state: TState, playerId: PlayerId): MoveOffering;
  /** Apply a validated move. Should return a new state rather than mutate. */
  applyMove(state: TState, move: MoveResponse, playerId: PlayerId): TState;
  /** Player-specific projection of the state (hides opponents' secrets). */
  viewFor(state: TState, viewerId: PlayerId): TView;
}
