import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";
import type { Game } from "./game.js";
import type { Move, PlayerView } from "./move.js";
import type { GameResult, Player } from "./player.js";

export interface GameRunResult<TState, TMove> {
  readonly result: GameResult;
  readonly finalState: TState;
  readonly history: readonly { readonly playerId: PlayerId; readonly move: TMove }[];
}

export class IllegalMoveError extends Error {
  constructor(
    readonly playerId: PlayerId,
    readonly move: Move,
  ) {
    super(`Player "${playerId}" returned an illegal move: ${JSON.stringify(move)}`);
    this.name = "IllegalMoveError";
  }
}

const defaultEquals = (a: Move, b: Move): boolean => JSON.stringify(a) === JSON.stringify(b);

export async function runGame<TState, TView extends PlayerView, TMove extends Move>(
  game: Game<TState, TView, TMove>,
  players: readonly Player<TView, TMove>[],
  rng: Rng,
): Promise<GameRunResult<TState, TMove>> {
  if (players.length === 0) {
    throw new Error("runGame requires at least one player");
  }

  const playersById = new Map<PlayerId, Player<TView, TMove>>();
  for (const p of players) {
    if (playersById.has(p.id)) {
      throw new Error(`Duplicate player id: "${p.id}"`);
    }
    playersById.set(p.id, p);
  }

  const playerIds = players.map((p) => p.id);
  let state = game.initialState(playerIds, rng);
  const movesEqual = game.movesEqual ?? defaultEquals;
  const history: { playerId: PlayerId; move: TMove }[] = [];

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
    const legal = game.legalMoves(state, currentId);
    if (legal.length === 0) {
      throw new Error(`No legal moves available for player "${currentId}"`);
    }

    const chosen = await player.decide(view, legal);
    if (!legal.some((m) => movesEqual(m, chosen))) {
      throw new IllegalMoveError(currentId, chosen);
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
