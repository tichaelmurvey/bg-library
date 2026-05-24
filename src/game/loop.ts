import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";
import type { Game } from "./game.js";
import type {
  AppliedMove,
  GameMove,
  Move,
  MoveContext,
  MoveOffering,
  MoveOption,
  MoveParamValue,
  MoveResponse,
  PlayerMoveContext,
  PlayerMoveOffer,
  PlayerTurnSequence,
  PlayerView,
  SequenceInfo,
  SequenceNode,
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

  // Build a global move catalog so triggers can find their targets
  // regardless of which phase issued them.
  const movesByType = collectMoves(game.gameSequence);

  let state = game.initialState(players, rng);
  const history: AppliedMove[] = [];

  for (const p of players) {
    await p.onGameStart?.(game.viewFor(state, p.id));
  }

  // Walk the game's sequence of phases. Each phase consumes turns until
  // it self-exits or `isTerminal` fires.
  for (const node of game.gameSequence) {
    if (game.isTerminal(state)) break;
    state = await runSequenceNode(node, game, players, state, history, rng, movesByType);
  }

  const finalResult = game.result(state);
  for (const p of players) {
    await p.onGameEnd?.(game.viewFor(state, p.id), finalResult);
  }

  return { result: finalResult, finalState: state, history };
}

function collectMoves<TState>(
  sequence: readonly SequenceNode<TState>[],
): Map<string, Move<TState>> {
  const map = new Map<string, Move<TState>>();
  const add = (m: Move<TState>) => {
    const existing = map.get(m.type);
    if (existing && existing !== m) {
      throw new Error(`Duplicate move type in gameSequence: "${m.type}"`);
    }
    map.set(m.type, m);
  };
  for (const node of sequence) {
    if ("kind" in node) {
      // Inline GameMove (engine-run).
      add(node);
    } else if (node.type === "player_turn_sequence") {
      for (const m of node.moves) add(m);
    }
  }
  return map;
}

async function runSequenceNode<TState, TView extends PlayerView>(
  node: SequenceNode<TState>,
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  state: TState,
  history: AppliedMove[],
  rng: Rng,
  movesByType: Map<string, Move<TState>>,
): Promise<TState> {
  if ("kind" in node) {
    if (node.kind !== "game") {
      throw new Error(
        `Inline gameSequence moves must be kind "game", got "${node.kind}" for "${node.type}"`,
      );
    }
    return runEngineMove(node, game, players, state, history, rng, movesByType);
  }
  if (node.type === "player_turn_sequence") {
    return runPlayerTurnSequence(node, game, players, state, history, rng, movesByType);
  }
  const _exhaustive: never = node;
  throw new Error(`Unknown gameSequence node: ${JSON.stringify(_exhaustive)}`);
}

/**
 * Run a single game-move as a standalone phase: no offering, no
 * decision. Triggers chain normally and resolve against the global
 * `movesByType` map.
 */
async function runEngineMove<TState, TView extends PlayerView>(
  move: GameMove<TState>,
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  state: TState,
  history: AppliedMove[],
  rng: Rng,
  movesByType: Map<string, Move<TState>>,
): Promise<TState> {
  await processChain(
    { type: move.type, params: {}, triggeredBy: undefined },
    movesByType,
    game,
    players,
    state,
    history,
    rng,
    undefined, // engine moves have no acting player
  );
  return state;
}

async function runPlayerTurnSequence<TState, TView extends PlayerView>(
  node: PlayerTurnSequence<TState>,
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  initialState: TState,
  history: AppliedMove[],
  rng: Rng,
  movesByType: Map<string, Move<TState>>,
): Promise<TState> {
  const s = initialState;
  let cursor = 0;
  let emptyStreak = 0;

  while (!game.isTerminal(s)) {
    const current = players[cursor];
    if (!current) throw new Error(`Sequence cursor ${cursor} out of bounds`);

    // Build the offering by asking every player-move in this node.
    const options: MoveOption[] = [];
    for (const m of node.moves) {
      if (m.kind !== "player") continue;
      const offer = m.offer(s, current.id);
      if (!offer) continue;
      options.push(toOption(m.type, offer));
    }

    if (options.length === 0) {
      // This player has nothing to do. Skip them and try the next.
      // If we go a full round without finding anyone who can move,
      // the phase is over.
      cursor = (cursor + 1) % players.length;
      emptyStreak++;
      if (emptyStreak >= players.length) return s;
      continue;
    }
    emptyStreak = 0;

    const offering: MoveOffering = { options };
    const chosen = await current.decide(game.viewFor(s, current.id), offering);
    const check = validateMoveResponse(offering, chosen);
    if (!check.ok) {
      throw new IllegalMoveError(current.id, chosen, check.reason);
    }

    const chosenMove = movesByType.get(chosen.type);
    if (!chosenMove || chosenMove.kind !== "player") {
      throw new IllegalMoveError(current.id, chosen, `Unknown player move "${chosen.type}"`);
    }

    const seq: SequenceInfo = {
      type: "player_turn_sequence",
      currentPlayer: { id: current.id },
    };
    const { forceAdvance } = await processChain(
      { type: chosen.type, params: chosen.params, triggeredBy: undefined },
      movesByType,
      game,
      players,
      s,
      history,
      rng,
      current.id,
      seq,
    );

    // After the chain settles: advance only if a move explicitly asked,
    // OR (implicitly, at the top of the next iteration) the player has
    // no more offerable moves.
    if (forceAdvance) {
      cursor = (cursor + 1) % players.length;
    }
    // else: re-loop on same player. If they have no offers, the
    // empty-streak branch above will advance us.
  }

  return s;
}

/**
 * Execute a move and walk its trigger chain depth-first. Each applied
 * move is appended to `history` and broadcast via `onMoveApplied`.
 * Returns whether any move in the chain called `ctx.advanceTurn()`.
 * The state is mutated in place.
 */
async function processChain<TState, TView extends PlayerView>(
  entry: StackFrame,
  movesByType: Map<string, Move<TState>>,
  game: Game<TState, TView>,
  players: readonly Player<TView>[],
  state: TState,
  history: AppliedMove[],
  rng: Rng,
  actingPlayerId: PlayerId | undefined,
  sequenceInfo?: SequenceInfo,
): Promise<{ forceAdvance: boolean }> {
  let forceAdvance = false;
  const advanceTurn = () => {
    forceAdvance = true;
  };

  // Moves queued via ctx.triggerMove() during the current apply call.
  // Cleared after each apply and its depth-first subtree settles.
  const pendingTriggers: StackFrame[] = [];

  const triggerMove = (type: string, params?: Readonly<Record<string, MoveParamValue>>): void => {
    pendingTriggers.push({ type, params: params ?? {}, triggeredBy: undefined });
  };

  const getSequence = (type?: string): SequenceInfo | undefined => {
    if (!sequenceInfo) return undefined;
    if (type !== undefined && sequenceInfo.type !== type) return undefined;
    return sequenceInfo;
  };

  const stack: StackFrame[] = [entry];

  while (stack.length > 0) {
    const frame = stack.pop() as StackFrame;
    const move = movesByType.get(frame.type);
    if (!move) {
      throw new Error(`Move not found in gameSequence: "${frame.type}"`);
    }
    if (frame.triggeredBy !== undefined && move.kind !== "game") {
      throw new Error(`Triggered move "${frame.type}" must be kind "game", got "${move.kind}"`);
    }

    // Build a ctx whose shape matches the move's kind. Player-moves get
    // `PlayerMoveContext` (required actingPlayerId); game-moves get the
    // base `MoveContext` (no actingPlayerId — game-moves act on the
    // state, optionally with a playerId passed via params).
    if (move.kind === "player") {
      if (actingPlayerId === undefined) {
        // Engine invariant: player-moves only run inside a player turn
        // sequence, so actingPlayerId is always set here.
        throw new Error(`Cannot run player-move "${frame.type}" outside a player turn`);
      }
      const ctx: PlayerMoveContext = {
        actingPlayerId,
        ...(frame.triggeredBy !== undefined ? { triggeredBy: frame.triggeredBy } : {}),
        rng,
        advanceTurn,
        triggerMove,
        getSequence,
      };
      move.apply(state, frame.params, ctx);
    } else {
      const ctx: MoveContext = {
        ...(frame.triggeredBy !== undefined ? { triggeredBy: frame.triggeredBy } : {}),
        rng,
        advanceTurn,
        triggerMove,
        getSequence,
      };
      move.apply(state, frame.params, ctx);
    }

    const applied: AppliedMove = {
      type: frame.type,
      params: frame.params,
      ...(actingPlayerId !== undefined ? { playerId: actingPlayerId } : {}),
      ...(frame.triggeredBy !== undefined ? { triggeredBy: frame.triggeredBy } : {}),
    };
    history.push(applied);

    for (const p of players) {
      await p.onMoveApplied?.(game.viewFor(state, p.id), applied);
    }

    // Push any triggers queued during this apply onto the stack in
    // reverse order so they run depth-first, left-to-right.
    if (pendingTriggers.length > 0) {
      for (let i = pendingTriggers.length - 1; i >= 0; i--) {
        const t = pendingTriggers[i] as StackFrame;
        stack.push({ ...t, triggeredBy: frame.type });
      }
      pendingTriggers.length = 0;
    }
  }

  return { forceAdvance };
}

function toOption(type: string, offer: PlayerMoveOffer): MoveOption {
  return offer.label !== undefined
    ? { type, label: offer.label, params: offer.params }
    : { type, params: offer.params };
}
