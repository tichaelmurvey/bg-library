import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";
import type { Move, PlayerView } from "./move.js";
import type { GameResult } from "./player.js";

export interface Game<TState, TView extends PlayerView, TMove extends Move> {
  initialState(playerIds: readonly PlayerId[], rng: Rng): TState;
  currentPlayer(state: TState): PlayerId;
  isTerminal(state: TState): boolean;
  result(state: TState): GameResult;
  legalMoves(state: TState, playerId: PlayerId): readonly TMove[];
  applyMove(state: TState, move: TMove, playerId: PlayerId): TState;
  viewFor(state: TState, viewerId: PlayerId): TView;
  /**
   * Optional equality check used by the loop to verify the move a Player
   * returned is one of the legal moves. Defaults to structural JSON equality.
   */
  movesEqual?(a: TMove, b: TMove): boolean;
}
