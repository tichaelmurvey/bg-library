import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32.js";
import { DicePool } from "./dice-pool.js";
import { Die, coin, d6, numericDie } from "./die.js";

describe("Die", () => {
  it("rolls within face set", () => {
    const die = d6(mulberry32(1));
    for (let i = 0; i < 100; i++) {
      const v = die.roll();
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("tracks lastRoll", () => {
    const die = d6(mulberry32(1));
    expect(die.lastRoll).toBeUndefined();
    const v = die.roll();
    expect(die.lastRoll).toBe(v);
  });

  it("is deterministic given the same RNG seed", () => {
    const a = d6(mulberry32(5));
    const b = d6(mulberry32(5));
    expect(Array.from({ length: 20 }, () => a.roll())).toEqual(
      Array.from({ length: 20 }, () => b.roll()),
    );
  });

  it("supports non-numeric faces", () => {
    const c = coin(mulberry32(1));
    const v = c.roll();
    expect(["heads", "tails"]).toContain(v);
  });

  it("rejects empty face arrays", () => {
    expect(() => new Die<number>([], mulberry32(1))).toThrow(RangeError);
  });

  it("numericDie rejects invalid side counts", () => {
    expect(() => numericDie(0, mulberry32(1))).toThrow(RangeError);
    expect(() => numericDie(2.5, mulberry32(1))).toThrow(RangeError);
  });
});

describe("DicePool", () => {
  it("rolls all dice", () => {
    const rng = mulberry32(1);
    const pool = new DicePool<number>([d6(rng), d6(rng), d6(rng)]);
    const results = pool.rollAll();
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
  });

  it("rerolls only specified indices", () => {
    const rng = mulberry32(1);
    const pool = new DicePool<number>([d6(rng), d6(rng), d6(rng)]);
    const first = pool.rollAll();
    const after = pool.reroll([1]);
    expect(after[0]).toBe(first[0]);
    expect(after[2]).toBe(first[2]);
  });

  it("throws when rerolling without initial rollAll", () => {
    const rng = mulberry32(1);
    const pool = new DicePool<number>([d6(rng)]);
    expect(() => pool.reroll([0])).toThrow();
  });

  it("throws on out-of-range reroll index", () => {
    const rng = mulberry32(1);
    const pool = new DicePool<number>([d6(rng), d6(rng)]);
    pool.rollAll();
    expect(() => pool.reroll([5])).toThrow(RangeError);
  });
});
