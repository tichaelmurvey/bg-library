import type { MoveParamValue, PlayerView } from "../../game/move.js";
import type { Player } from "../../game/player.js";
import type { PlayerId } from "../../hand/hand.js";
import type { Rng } from "../../rng/rng.js";

/**
 * A bot that picks a uniformly-random *legal* move from each offering.
 * Useful as a placeholder opponent, baseline benchmark, or smoke test.
 *
 * Randomness is fully driven by the provided `Rng`, so the same seed
 * produces the same sequence of decisions. Per-param behavior:
 *
 * - `named-options` → uniform random pick from `options`
 * - `number-range`  → uniform random value in `[min, max]`, aligned to `step`
 * - `binary`        → uniform random boolean
 * - `string`        → the empty string
 *
 * Throws if the offering has no options, or if a `named-options` param
 * has an empty `options` array (both indicate malformed offerings).
 */
export function randomBot<TView extends PlayerView>(id: PlayerId, rng: Rng): Player<TView> {
  return {
    id,
    async decide(_view, offering) {
      const option = offering.options[rng.int(offering.options.length)];
      if (!option) throw new Error("randomBot: empty offering");
      const params: Record<string, MoveParamValue> = {};
      for (const param of option.params) {
        switch (param.kind) {
          case "named-options": {
            const choice = param.options[rng.int(param.options.length)];
            if (choice === undefined) {
              throw new Error(`randomBot: empty options for param "${param.name}"`);
            }
            params[param.name] = choice;
            break;
          }
          case "number-range": {
            const step = param.step ?? 1;
            const steps = Math.floor((param.max - param.min) / step) + 1;
            params[param.name] = param.min + rng.int(steps) * step;
            break;
          }
          case "binary":
            params[param.name] = rng.int(2) === 0;
            break;
          case "string":
            params[param.name] = "";
            break;
        }
      }
      return { type: option.type, params };
    },
  };
}
