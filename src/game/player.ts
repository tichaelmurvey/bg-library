import type { PlayerId } from "../hand/hand.js";
import type { MoveOffering, MoveResponse, PlayerView } from "./move.js";

export interface GameResult {
  readonly winners: readonly PlayerId[];
  readonly scores?: Readonly<Record<PlayerId, number>>;
  readonly reason?: string;
}

export interface Player<TView extends PlayerView> {
  readonly id: PlayerId;
  /**
   * Called when it is this player's turn. Receives a view of the state and
   * the structured offering of available moves. Must return a response whose
   * `type` matches one of the offering's options and whose `params` satisfy
   * that option's schema.
   */
  decide(view: TView, offering: MoveOffering): Promise<MoveResponse>;
  onGameStart?(view: TView): void | Promise<void>;
  onMoveApplied?(view: TView, move: MoveResponse, byPlayer: PlayerId): void | Promise<void>;
  onGameEnd?(view: TView, result: GameResult): void | Promise<void>;
}
