import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";
import type { Game } from "./game.js";
import type { MoveResponse, PlayerView } from "./move.js";
import { validateMoveResponse } from "./move.js";
import type { GameResult, Player } from "./player.js";

export interface GameRunResult<TState> {
  readonly result: GameResult;
  readonly finalState: TState;
  readonly history: readonly { readonly playerId: PlayerId; readonly move: MoveResponse }[];
}

export class IllegalMoveError extends Error {
  constructor(
    readonly playerId: PlayerId,
    readonly move: MoveResponse,
    readonly reason: string,
  ) {
    super(`Player "${playerId}" returned an illegal move (${reason}): ${JSON.stringify(move)}`);
    this.name = "IllegalMoveError";
  }
}

export async function runGame<TState, TView extends PlayerView>(
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  rng: Rng,
): Promise<GameRunResult<TState>> {
  if (players.length === 0) {
    throw new Error("runGame requires at least one player");
  }

  const playersById = new Map<PlayerId, Player<TView>>();
  for (const p of players) {
    if (playersById.has(p.id)) {
      throw new Error(`Duplicate player id: "${p.id}"`);
    }
    playersById.set(p.id, p);
  }

  const playerIds = players.map((p) => p.id);
  let state = game.initialState(playerIds, rng);
  const history: { playerId: PlayerId; move: MoveResponse }[] = [];

  for (const p of players) {
    await p.onGameStart?.(game.viewFor(state, p.id));
  }

  while (!game.isTerminal(state)) {
    const currentId = game.currentPlayer(state);
    const player = playersById.get(currentId);
    if (!player) {
      throw new Error(`No player registered for id "${currentId}"`);
    }

    const view = game.viewFor(state, currentId);
    const offering = game.moveOffering(state, currentId);
    if (offering.options.length === 0) {
      throw new Error(`No move options offered to player "${currentId}"`);
    }

    const chosen = await player.decide(view, offering);
    const check = validateMoveResponse(offering, chosen);
    if (!check.ok) {
      throw new IllegalMoveError(currentId, chosen, check.reason);
    }

    state = game.applyMove(state, chosen, currentId);
    history.push({ playerId: currentId, move: chosen });

    for (const p of players) {
      await p.onMoveApplied?.(game.viewFor(state, p.id), chosen, currentId);
    }
  }

  const result = game.result(state);
  for (const p of players) {
    await p.onGameEnd?.(game.viewFor(state, p.id), result);
  }

  return { result, finalState: state, history };
}
