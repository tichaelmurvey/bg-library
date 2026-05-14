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
