import type { Rng } from "./rng.js";

class Mulberry32 implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 0 || !Number.isInteger(maxExclusive)) {
      throw new RangeError(`int(maxExclusive) requires a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError("pick() called on an empty array");
    }
    return items[this.int(items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  fork(): Rng {
    return new Mulberry32(this.int(0x7fffffff));
  }
}

export function mulberry32(seed: number): Rng {
  return new Mulberry32(seed);
}
