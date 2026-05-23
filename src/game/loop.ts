import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";
import type { Game } from "./game.js";
import type {
  AppliedMove,
  Move,
  MoveContext,
  MoveOffering,
  MoveOption,
  MoveParamValue,
  MoveResponse,
  PlayerMoveOffer,
  PlayerTurnSequence,
  PlayerView,
  SequenceNode,
  TriggeredMove,
} from "./move.js";
import { validateMoveResponse } from "./move.js";
import type { GameResult, Player } from "./player.js";

export interface GameRunResult<TState> {
  readonly result: GameResult;
  readonly finalState: TState;
  /**
   * Every move applied during the game, in order. Includes both the
   * player-chosen moves and the game-triggered follow-ups. Tell them
   * apart via `triggeredBy`: present on game-triggered moves, absent on
   * player-chosen ones.
   */
  readonly history: readonly AppliedMove[];
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

type StackFrame = {
  readonly type: string;
  readonly params: Readonly<Record<string, MoveParamValue>>;
  readonly triggeredBy: string | undefined;
};

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

  let state = game.initialState(players, rng);
  const history: AppliedMove[] = [];

  for (const p of players) {
    await p.onGameStart?.(game.viewFor(state, p.id));
  }

  // Walk the game's sequence of phases. Each phase consumes turns until
  // it self-exits or `isTerminal` fires.
  for (const node of game.gameSequence) {
    if (game.isTerminal(state)) break;
    state = await runSequenceNode(
      node,
      game,
      players,
      state,
      history,
      rng,
    );
  }

  const finalResult = game.result(state);
  for (const p of players) {
    await p.onGameEnd?.(game.viewFor(state, p.id), finalResult);
  }

  return { result: finalResult, finalState: state, history };
}

async function runSequenceNode<TState, TView extends PlayerView>(
  node: SequenceNode<TState>,
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  state: TState,
  history: AppliedMove[],
  rng: Rng,
): Promise<TState> {
  if (node.type === "player_turn_sequence") {
    return runPlayerTurnSequence(node, game, players, state, history, rng);
  }
  // Future node types land here. Exhaustiveness check:
  const _exhaustive: never = node.type;
  throw new Error(`Unknown gameSequence node type: ${_exhaustive}`);
}

async function runPlayerTurnSequence<TState, TView extends PlayerView>(
  node: PlayerTurnSequence<TState>,
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  state: TState,
  history: AppliedMove[],
  rng: Rng,
): Promise<TState> {
  const movesByType = new Map<string, Move<TState>>();
  for (const m of node.moves) {
    if (movesByType.has(m.type)) {
      throw new Error(`Duplicate move type in sequence: "${m.type}"`);
    }
    movesByType.set(m.type, m);
  }

  let cursor = 0;
  let emptyStreak = 0;

  while (!game.isTerminal(state)) {
    const current = players[cursor];
    if (!current) throw new Error(`Sequence cursor ${cursor} out of bounds`);

    // Build the offering by asking every player-move in this node.
    const options: MoveOption[] = [];
    for (const m of node.moves) {
      if (m.kind !== "player") continue;
      const offer = m.offer(state, current.id);
      if (!offer) continue;
      options.push(toOption(m.type, offer));
    }

    if (options.length === 0) {
      // This player has nothing to do. Skip them and try the next.
      // If we go a full round without finding anyone who can move,
      // the phase is over.
      cursor = (cursor + 1) % players.length;
      emptyStreak++;
      if (emptyStreak >= players.length) return state;
      continue;
    }
    emptyStreak = 0;

    const offering: MoveOffering = { options };
    const chosen = await current.decide(game.viewFor(state, current.id), offering);
    const check = validateMoveResponse(offering, chosen);
    if (!check.ok) {
      throw new IllegalMoveError(current.id, chosen, check.reason);
    }

    const chosenMove = movesByType.get(chosen.type);
    if (!chosenMove || chosenMove.kind !== "player") {
      throw new IllegalMoveError(current.id, chosen, `Unknown player move "${chosen.type}"`);
    }

    // Run the chosen player-move + its triggered chain depth-first. A
    // shared `forceAdvance` flag is exposed to every `apply` via
    // `ctx.advanceTurn()`.
    let forceAdvance = false;
    const makeCtx = (triggeredBy: string | undefined): MoveContext => {
      const base = {
        actingPlayerId: current.id,
        rng,
        advanceTurn() {
          forceAdvance = true;
        },
      };
      return triggeredBy !== undefined ? { ...base, triggeredBy } : base;
    };

    const stack: StackFrame[] = [
      { type: chosen.type, params: chosen.params, triggeredBy: undefined },
    ];

    while (stack.length > 0) {
      const frame = stack.pop() as StackFrame;
      const move = movesByType.get(frame.type);
      if (!move) {
        throw new Error(`Triggered move not found in sequence: "${frame.type}"`);
      }
      if (frame.triggeredBy !== undefined && move.kind !== "game") {
        throw new Error(
          `Triggered move "${frame.type}" must be kind "game", got "${move.kind}"`,
        );
      }

      const ctx = makeCtx(frame.triggeredBy);
      const out = move.apply(state, frame.params, ctx);
      state = out.state;

      const applied: AppliedMove =
        frame.triggeredBy !== undefined
          ? {
              type: frame.type,
              params: frame.params,
              playerId: current.id,
              triggeredBy: frame.triggeredBy,
            }
          : { type: frame.type, params: frame.params, playerId: current.id };
      history.push(applied);

      for (const p of players) {
        await p.onMoveApplied?.(game.viewFor(state, p.id), applied);
      }

      if (out.triggers && out.triggers.length > 0) {
        for (let i = out.triggers.length - 1; i >= 0; i--) {
          const t = out.triggers[i] as TriggeredMove;
          stack.push({
            type: t.type,
            params: t.params ?? {},
            triggeredBy: frame.type,
          });
        }
      }
    }

    // After the chain settles: advance only if a move explicitly asked,
    // OR (implicitly, at the top of the next iteration) the player has
    // no more offerable moves.
    if (forceAdvance) {
      cursor = (cursor + 1) % players.length;
    }
    // else: re-loop on same player. If they have no offers, the
    // empty-streak branch above will advance us.
  }

  return state;
}

function toOption(type: string, offer: PlayerMoveOffer): MoveOption {
  return offer.label !== undefined
    ? { type, label: offer.label, params: offer.params }
    : { type, params: offer.params };
}
