import type { PlayerId } from "../hand/hand.js";
import type { Move, PlayerView } from "./move.js";

export interface GameResult {
  readonly winners: readonly PlayerId[];
  readonly scores?: Readonly<Record<PlayerId, number>>;
  readonly reason?: string;
}

export interface Player<TView extends PlayerView, TMove extends Move> {
  readonly id: PlayerId;
  decide(view: TView, legalMoves: readonly TMove[]): Promise<TMove>;
  onGameStart?(view: TView): void | Promise<void>;
  onMoveApplied?(view: TView, move: TMove, byPlayer: PlayerId): void | Promise<void>;
  onGameEnd?(view: TView, result: GameResult): void | Promise<void>;
}
