import type { Hand, PlayerId } from "../hand/hand.js";
import type { AppliedMove, MoveOffering, MoveResponse, PlayerView } from "./move.js";

export interface GameResult {
  readonly winners: readonly PlayerId[];
  readonly scores?: Readonly<Record<PlayerId, number>>;
  readonly reason?: string;
}

export interface Player<TView extends PlayerView> {
  readonly id: PlayerId;
  /**
   * Optional reference to the player's owned `Hand`. Typically wired up
   * by the game's `initialState` once both objects exist, providing a
   * convenient `player.hand` ⇄ `hand.player` cross-link.
   */
  hand?: Hand<unknown>;
  /**
   * Called when it is this player's turn. Receives a view of the state and
   * the structured offering of available moves. Must return a response whose
   * `type` matches one of the offering's options and whose `params` satisfy
   * that option's schema.
   */
  decide(view: TView, offering: MoveOffering): Promise<MoveResponse>;
  onGameStart?(view: TView): void | Promise<void>;
  /**
   * Fires after **every** applied move — both the player-chosen move and
   * each game-triggered follow-up move. Inspect `applied.triggeredBy` to
   * tell them apart.
   */
  onMoveApplied?(view: TView, applied: AppliedMove): void | Promise<void>;
  onGameEnd?(view: TView, result: GameResult): void | Promise<void>;
}
