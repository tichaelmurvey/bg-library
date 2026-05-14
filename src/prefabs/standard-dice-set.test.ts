import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32.js";
import { standardDiceSet } from "./standard-dice-set.js";

describe("standardDiceSet", () => {
  it("exposes every die at the expected key", () => {
    const set = standardDiceSet(mulberry32(1));
    expect(set.d4.faceCount).toBe(4);
    expect(set.d6.faceCount).toBe(6);
    expect(set.d8.faceCount).toBe(8);
    expect(set.d10.faceCount).toBe(10);
    expect(set.d12.faceCount).toBe(12);
    expect(set.d20.faceCount).toBe(20);
    expect(set.d100.tens.faceCount).toBe(10);
    expect(set.d100.ones.faceCount).toBe(10);
  });

  it("each die rolls within its expected range", () => {
    const set = standardDiceSet(mulberry32(2));
    const checks: Array<[number, () => number]> = [
      [4, () => set.d4.roll()],
      [6, () => set.d6.roll()],
      [8, () => set.d8.roll()],
      [10, () => set.d10.roll()],
      [12, () => set.d12.roll()],
      [20, () => set.d20.roll()],
    ];
    for (const [max, roll] of checks) {
      for (let i = 0; i < 50; i++) {
        const v = roll();
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(max);
      }
    }
    for (let i = 0; i < 50; i++) {
      const v = set.d100.roll();
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic across the whole set for the same seed", () => {
    const a = standardDiceSet(mulberry32(42));
    const b = standardDiceSet(mulberry32(42));
    const sequence = (set: ReturnType<typeof standardDiceSet>) => [
      set.d4.roll(),
      set.d20.roll(),
      set.d6.roll(),
      set.d100.roll(),
    ];
    expect(sequence(a)).toEqual(sequence(b));
  });
});
