// The "move offering" is what a game presents to a player on their turn.
// It is a serializable description of the action space — what move types
// are available and, for each, what parameters the player must fill in.
//
// A player consumes a MoveOffering and produces a MoveResponse. The loop
// validates the response against the offering before applying it.

// --- Param kinds --------------------------------------------------------

export type ParamKind = "binary" | "number-range" | "named-options" | "string";

/** A two-way choice. Response value is a boolean. Labels are display-only. */
export interface BinaryParam {
    readonly name: string;
    readonly kind: "binary";
    /** Label shown for the `true` value (e.g. "forward"). Optional. */
    readonly trueLabel?: string;
    /** Label shown for the `false` value (e.g. "back"). Optional. */
    readonly falseLabel?: string;
}

/** Integer (or stepped) range, inclusive of both bounds. Response is a number. */
export interface NumberRangeParam {
    readonly name: string;
    readonly kind: "number-range";
    readonly min: number;
    readonly max: number;
    /** Step between allowed values. Defaults to 1. Must be > 0. */
    readonly step?: number;
}

/** Pick one of a fixed list of string options. Response is one of `options`. */
export interface NamedOptionsParam {
    readonly name: string;
    readonly kind: "named-options";
    readonly options: readonly string[];
}

/** Free text with bounds. Response is a string. */
export interface StringParam {
    readonly name: string;
    readonly kind: "string";
    readonly maxLength: number;
    readonly minLength?: number;
}

/** Discriminated union of every supported param kind. */
export type MoveParam = BinaryParam | NumberRangeParam | NamedOptionsParam | StringParam;

/** The response value matching a given param kind. */
export type ParamValueFor<P extends MoveParam> = P extends BinaryParam
    ? boolean
    : P extends NumberRangeParam
    ? number
    : P extends NamedOptionsParam
    ? string
    : P extends StringParam
    ? string
    : never;

/** Any valid param response value. */
export type MoveParamValue = boolean | number | string;

// --- Offering -----------------------------------------------------------

/** One move type the player may choose (e.g. "draw", "play", "pass"). */
export interface MoveOption {
    /** Stable identifier for this move type. Unique within an offering. */
    readonly type: string;
    /** Optional human-readable label. */
    readonly label?: string;
    /** Zero or more parameters. Each `name` must be unique within this option. */
    readonly params: readonly MoveParam[];
}

/** The complete set of moves a player may make on their turn. */
export interface MoveOffering {
    readonly options: readonly MoveOption[];
}

// --- Response -----------------------------------------------------------

/** What a player returns from `decide()`. */
export interface MoveResponse {
    /** Must match a `MoveOption.type` in the offering. */
    readonly type: string;
    /** Keyed by param name. Each value's runtime type must match the param's kind. */
    readonly params: Readonly<Record<string, MoveParamValue>>;
}

// --- Validation ---------------------------------------------------------

export type ValidationResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string };

/**
 * Validate a player's response against the offering. Returns a structured
 * result rather than throwing so callers can choose how to surface failure.
 */
export function validateMoveResponse(
    offering: MoveOffering,
    response: MoveResponse,
): ValidationResult {
    const option = offering.options.find((o) => o.type === response.type);
    if (!option) {
        return { ok: false, reason: `Unknown move type: "${response.type}"` };
    }

    const expectedNames = new Set(option.params.map((p) => p.name));
    for (const key of Object.keys(response.params)) {
        if (!expectedNames.has(key)) {
            return { ok: false, reason: `Unexpected param "${key}" for move "${response.type}"` };
        }
    }

    for (const param of option.params) {
        const value = response.params[param.name];
        if (value === undefined) {
            return { ok: false, reason: `Missing param "${param.name}" for move "${response.type}"` };
        }
        const paramCheck = validateParamValue(param, value);
        if (!paramCheck.ok) return paramCheck;
    }

    return { ok: true };
}

function validateParamValue(param: MoveParam, value: MoveParamValue): ValidationResult {
    switch (param.kind) {
        case "binary":
            if (typeof value !== "boolean") {
                return { ok: false, reason: `Param "${param.name}" expects boolean, got ${typeof value}` };
            }
            return { ok: true };
        case "number-range": {
            if (typeof value !== "number" || !Number.isFinite(value)) {
                return {
                    ok: false,
                    reason: `Param "${param.name}" expects finite number, got ${typeof value}`,
                };
            }
            if (value < param.min || value > param.max) {
                return {
                    ok: false,
                    reason: `Param "${param.name}" value ${value} outside [${param.min}, ${param.max}]`,
                };
            }
            const step = param.step ?? 1;
            if (step <= 0) {
                return { ok: false, reason: `Param "${param.name}" has invalid step ${step}` };
            }
            const offset = value - param.min;
            // Float-tolerant step check.
            const remainder = Math.abs(offset / step - Math.round(offset / step));
            if (remainder > 1e-9) {
                return {
                    ok: false,
                    reason: `Param "${param.name}" value ${value} not aligned to step ${step} from ${param.min}`,
                };
            }
            return { ok: true };
        }
        case "named-options":
            if (typeof value !== "string") {
                return { ok: false, reason: `Param "${param.name}" expects string, got ${typeof value}` };
            }
            if (!param.options.includes(value)) {
                return {
                    ok: false,
                    reason: `Param "${param.name}" value "${value}" not in [${param.options.join(", ")}]`,
                };
            }
            return { ok: true };
        case "string": {
            if (typeof value !== "string") {
                return { ok: false, reason: `Param "${param.name}" expects string, got ${typeof value}` };
            }
            const min = param.minLength ?? 0;
            if (value.length < min) {
                return {
                    ok: false,
                    reason: `Param "${param.name}" length ${value.length} below min ${min}`,
                };
            }
            if (value.length > param.maxLength) {
                return {
                    ok: false,
                    reason: `Param "${param.name}" length ${value.length} exceeds max ${param.maxLength}`,
                };
            }
            return { ok: true };
        }
    }
}

// --- View ---------------------------------------------------------------

/** A player-specific projection of game state. Game-defined shape. */
export type PlayerView = Readonly<Record<string, unknown>>;

// --- Move definitions ---------------------------------------------------
//
// A game's rules are described by a list of `Move`s rather than by hand-
// written `moveOffering` / `applyMove` switches. There are two kinds:
//
//   - **PlayerMove**: a move a player can choose on their turn. It owns
//     both its offering (the per-state `offer()` callback that returns
//     the option's params or `null` if currently unavailable) and its
//     reducer (`apply()`).
//   - **GameMove**: a move the engine runs in response to a trigger,
//     never offered to players. Useful for follow-up steps like "draw
//     from stock", "commit any books", "advance turn".
//
// Either kind's `apply` returns a `MoveResult` carrying the next state
// and an optional list of triggered moves. Triggered moves are looked
// up by `type` and processed depth-first before the loop yields back to
// the next player turn.

import type { PlayerId } from "../hand/hand.js";
import type { Rng } from "../rng/rng.js";

/** A reference to another move plus the params it should receive. */
export interface TriggeredMove {
    readonly type: string;
    readonly params?: Readonly<Record<string, MoveParamValue>>;
}

/** Return shape for every `Move.apply`. */
export interface MoveResult<TState> {
    readonly state: TState;
    /** Moves to run after this one, depth-first. Looked up by `type`. */
    readonly triggers?: readonly TriggeredMove[];
}

/** Context passed to every `apply`. */
export interface MoveContext {
    /**
     * The player whose turn this move belongs to. Set on every move run
     * inside a `player_turn_sequence` (both player-chosen and triggered).
     * Undefined for moves run as standalone entries in `gameSequence`
     * (e.g. an `initial-deal` setup move).
     */
    readonly actingPlayerId?: PlayerId;
    /** The move type that triggered this one. Undefined for the entrypoint move. */
    readonly triggeredBy?: string;
    readonly rng: Rng;
    /**
     * Force the enclosing `player_turn_sequence` to advance to the next
     * player after the current chain settles. Without this call, the
     * sequence's default is: re-prompt the same player as long as they
     * still have offerable moves, otherwise advance.
     *
     * No-op outside a `player_turn_sequence` (e.g. inside a standalone
     * engine move) — there's no cursor to advance.
     */
    advanceTurn(): void;
}

/**
 * Narrowed `MoveContext` for `PlayerMove.apply`: `actingPlayerId` is
 * guaranteed by the engine to be defined (a player-move only ever
 * runs when there's a current player). Game-move authors keep the
 * looser `MoveContext` because game-moves can run in engine chains
 * where no player is on turn.
 */
export interface PlayerMoveContext extends Omit<MoveContext, "actingPlayerId"> {
    readonly actingPlayerId: PlayerId;
}

/** What a `PlayerMove.offer` returns when the move is currently legal. */
export interface PlayerMoveOffer {
    readonly label?: string;
    readonly params: readonly MoveParam[];
}

export interface PlayerMove<TState> {
    readonly kind: "player";
    readonly type: string;
    /**
     * Build this move's option for the offering given the current state and
     * the player on turn. Return `null` if the move is not currently legal —
     * it will be omitted from the offering.
     */
    offer(state: TState, playerId: PlayerId): PlayerMoveOffer | null;
    /**
     * Apply the move with the params the player chose. Return the new state
     * and any follow-up `triggers`. `ctx.actingPlayerId` is always set —
     * the engine only invokes player-moves when a player is on turn.
     */
    apply(
        state: TState,
        params: Readonly<Record<string, MoveParamValue>>,
        ctx: PlayerMoveContext,
    ): MoveResult<TState>;
}

export interface GameMove<TState> {
    readonly kind: "game";
    readonly type: string;
    /** Apply this triggered move with the params the trigger supplied. */
    apply(
        state: TState,
        params: Readonly<Record<string, MoveParamValue>>,
        ctx: MoveContext,
    ): MoveResult<TState>;
}

export type Move<TState> = PlayerMove<TState> | GameMove<TState>;

/** A move recorded in `GameRunResult.history` — player or triggered. */
export interface AppliedMove {
    readonly type: string;
    readonly params: Readonly<Record<string, MoveParamValue>>;
    /** Who was on turn when this move was applied. */
    readonly playerId: PlayerId;
    /** For game-triggered moves: the move type that triggered this one. Absent on the player-chosen move. */
    readonly triggeredBy?: string;
}

// --- Game sequence ------------------------------------------------------
//
// A `Game.gameSequence` is a list of high-level phases the engine runs in
// order. Each phase is a tagged `SequenceNode`. The only node type today
// is `player_turn_sequence` — additional types (setup, scoring, etc.)
// can be added without breaking the schema.

/**
 * A phase that iterates players round-robin. For each player the engine
 * offers every player-move in `moves`; the player picks one; that move's
 * `apply` runs and its triggers chain depth-first. After the chain
 * settles the engine re-tries the same player — they keep the turn as
 * long as at least one player-move still returns a non-null offer.
 * Advance to the next player happens when either:
 *   - the current player has no offerable moves left, or
 *   - some move in the chain called `ctx.advanceTurn()`.
 *
 * The phase exits when every player has been skipped consecutively
 * (no one can move) or when `Game.isTerminal` returns true.
 */
export interface PlayerTurnSequence<TState> {
    readonly type: "player_turn_sequence";
    readonly moves: readonly Move<TState>[];
}

/**
 * A `Game.gameSequence` entry. Either a structured sub-phase (today
 * just `PlayerTurnSequence`) or a bare `GameMove` that the engine runs
 * once. Inline game-moves are convenient for setup and teardown steps
 * (e.g. an initial-deal move before the player turns begin).
 */
export type SequenceNode<TState> = PlayerTurnSequence<TState> | GameMove<TState>;
