import type { Rng } from "../rng/rng.js";

export class Die<TFace = number> {
  private readonly faces: readonly TFace[];
  private readonly rng: Rng;
  private _lastRoll: TFace | undefined;

  constructor(faces: readonly TFace[], rng: Rng) {
    if (faces.length === 0) {
      throw new RangeError("Die requires at least one face");
    }
    this.faces = faces;
    this.rng = rng;
  }

  roll(): TFace {
    const face = this.rng.pick(this.faces);
    this._lastRoll = face;
    return face;
  }

  get lastRoll(): TFace | undefined {
    return this._lastRoll;
  }

  get faceCount(): number {
    return this.faces.length;
  }
}

export function numericDie(sides: number, rng: Rng): Die<number> {
  if (sides < 1 || !Number.isInteger(sides)) {
    throw new RangeError(`numericDie requires a positive integer side count, got ${sides}`);
  }
  const faces = Array.from({ length: sides }, (_, i) => i + 1);
  return new Die<number>(faces, rng);
}

export const d4 = (rng: Rng): Die<number> => numericDie(4, rng);
export const d6 = (rng: Rng): Die<number> => numericDie(6, rng);
export const d8 = (rng: Rng): Die<number> => numericDie(8, rng);
export const d10 = (rng: Rng): Die<number> => numericDie(10, rng);
export const d12 = (rng: Rng): Die<number> => numericDie(12, rng);
export const d20 = (rng: Rng): Die<number> => numericDie(20, rng);
export const coin = (rng: Rng): Die<"heads" | "tails"> =>
  new Die<"heads" | "tails">(["heads", "tails"], rng);
