import { type Die, type PercentileDice, d4, d6, d8, d10, d12, d20, d100 } from "../dice/die.js";
import type { Rng } from "../rng/rng.js";

/**
 * The canonical tabletop dice set: d4 through d20 plus a percentile d100.
 *
 * All dice share the given `Rng`, so the *order* of rolls across the set
 * determines the sequence (matching how `Deck` and `Hand` share an
 * `Rng`). For independent streams per die, give each its own forked
 * `Rng` and construct dice manually.
 */
export interface StandardDiceSet {
  readonly d4: Die<number>;
  readonly d6: Die<number>;
  readonly d8: Die<number>;
  readonly d10: Die<number>;
  readonly d12: Die<number>;
  readonly d20: Die<number>;
  readonly d100: PercentileDice;
}

export function standardDiceSet(rng: Rng): StandardDiceSet {
  return {
    d4: d4(rng),
    d6: d6(rng),
    d8: d8(rng),
    d10: d10(rng),
    d12: d12(rng),
    d20: d20(rng),
    d100: d100(rng),
  };
}
