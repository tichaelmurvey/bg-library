import type { Die } from "./die.js";

export class DicePool<TFace = number> {
  private readonly dice: readonly Die<TFace>[];
  private _results: TFace[] = [];

  constructor(dice: readonly Die<TFace>[]) {
    if (dice.length === 0) {
      throw new RangeError("DicePool requires at least one die");
    }
    this.dice = dice;
  }

  get size(): number {
    return this.dice.length;
  }

  get results(): readonly TFace[] {
    return this._results;
  }

  rollAll(): TFace[] {
    this._results = this.dice.map((d) => d.roll());
    return this._results.slice();
  }

  reroll(indices: readonly number[]): TFace[] {
    if (this._results.length !== this.dice.length) {
      throw new Error("Cannot reroll before initial rollAll()");
    }
    for (const i of indices) {
      const die = this.dice[i];
      if (!die) {
        throw new RangeError(`reroll index ${i} out of range (size ${this.dice.length})`);
      }
      this._results[i] = die.roll();
    }
    return this._results.slice();
  }
}
