import { describe, expect, it } from "vitest";
import { mulberry32 } from "./mulberry32.js";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() respects bounds", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = r.int(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("shuffle() preserves elements and is deterministic", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    const input = [1, 2, 3, 4, 5, 6, 7];
    const sa = a.shuffle(input);
    const sb = b.shuffle(input);
    expect(sa).toEqual(sb);
    expect(sa.slice().sort()).toEqual(input);
  });

  it("fork() creates an independent stream", () => {
    const parent = mulberry32(123);
    const child = parent.fork();
    expect(child.next()).not.toEqual(parent.next());
  });
});
