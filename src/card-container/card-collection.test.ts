import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32.js";
import { CardCollection } from "./card-collection.js";
import type { CardContainer } from "./card-container.js";

const stubContainer = <T>(): CardContainer<T> & { received: T[] } => {
  const received: T[] = [];
  return {
    received,
    get size() {
      return received.length;
    },
    add(card) {
      if (Array.isArray(card)) received.push(...(card as T[]));
      else received.push(card as T);
    },
    contains: (p) => received.some(p),
    move: (p, dest) => {
      const i = received.findIndex(p);
      if (i === -1) return undefined;
      const [card] = received.splice(i, 1);
      dest.add(card);
      return card;
    },
    shuffle: () => {},
  };
};

const make = <T>(initial: readonly T[] = [], seed = 1) =>
  new CardCollection<T>(mulberry32(seed), initial);

describe("CardCollection", () => {
  it("starts at the given initial size", () => {
    expect(make([1, 2, 3]).size).toBe(3);
  });

  it("snapshot returns a defensive copy", () => {
    const c = make([1, 2, 3]);
    const snap = c.snapshot();
    snap.push(99);
    expect(c.size).toBe(3);
  });

  it("addToEnd appends in order", () => {
    const c = make<number>([1, 2]);
    c.addToEnd(3);
    c.addToEnd([4, 5]);
    expect(c.snapshot()).toEqual([1, 2, 3, 4, 5]);
  });

  it("addToStart prepends in order", () => {
    const c = make<number>([3, 4]);
    c.addToStart([1, 2]);
    expect(c.snapshot()).toEqual([1, 2, 3, 4]);
  });

  it("contains uses the predicate", () => {
    const c = make<number>([1, 2, 3]);
    expect(c.contains((x) => x === 2)).toBe(true);
    expect(c.contains((x) => x === 99)).toBe(false);
  });

  it("move transfers the first matching item to the destination", () => {
    const c = make<number>([1, 2, 3, 2]);
    const dest = stubContainer<number>();
    expect(c.move((x) => x === 2, dest)).toBe(2);
    expect(c.snapshot()).toEqual([1, 3, 2]);
    expect(dest.received).toEqual([2]);
  });

  it("move returns undefined when nothing matches", () => {
    const c = make<number>([1, 2]);
    const dest = stubContainer<number>();
    expect(c.move((x) => x === 99, dest)).toBeUndefined();
    expect(c.size).toBe(2);
    expect(dest.received).toEqual([]);
  });

  it("shuffle is deterministic for same seed", () => {
    const a = make([1, 2, 3, 4, 5, 6, 7], 42);
    const b = make([1, 2, 3, 4, 5, 6, 7], 42);
    a.shuffle();
    b.shuffle();
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it("peekFromEnd does not mutate", () => {
    const c = make<number>([1, 2, 3, 4]);
    expect(c.peekFromEnd(2)).toEqual([3, 4]);
    expect(c.size).toBe(4);
  });

  it("peekFromEnd caps at size", () => {
    const c = make<number>([1, 2]);
    expect(c.peekFromEnd(99)).toEqual([1, 2]);
  });

  it("takeFromEnd removes and returns in underlying order", () => {
    const c = make<number>([1, 2, 3, 4, 5]);
    expect(c.takeFromEnd(2)).toEqual([4, 5]);
    expect(c.snapshot()).toEqual([1, 2, 3]);
  });

  it("takeFromEnd throws on underflow", () => {
    const c = make<number>([1, 2]);
    expect(() => c.takeFromEnd(5)).toThrow(RangeError);
  });

  it("replace wholesale-substitutes the items", () => {
    const c = make<number>([1, 2, 3]);
    c.replace([10, 20]);
    expect(c.snapshot()).toEqual([10, 20]);
  });

  describe("deal", () => {
    it("distributes n cards round-robin from the end", () => {
      const c = make<number>([1, 2, 3, 4, 5, 6, 7, 8]);
      const a = stubContainer<number>();
      const b = stubContainer<number>();
      c.deal([a, b], 3);
      // Source had [1..8], end is 8. Round-robin from end:
      //   round 0: a<-8, b<-7
      //   round 1: a<-6, b<-5
      //   round 2: a<-4, b<-3
      expect(a.received).toEqual([8, 6, 4]);
      expect(b.received).toEqual([7, 5, 3]);
      expect(c.snapshot()).toEqual([1, 2]);
    });

    it("is a no-op when n is 0", () => {
      const c = make<number>([1, 2, 3]);
      const a = stubContainer<number>();
      c.deal([a], 0);
      expect(a.received).toEqual([]);
      expect(c.size).toBe(3);
    });

    it("throws on negative or non-integer n", () => {
      const c = make<number>([1, 2, 3]);
      expect(() => c.deal([stubContainer()], -1)).toThrow(RangeError);
      expect(() => c.deal([stubContainer()], 1.5)).toThrow(RangeError);
    });

    it("throws on empty container list", () => {
      const c = make<number>([1, 2, 3]);
      expect(() => c.deal([], 1)).toThrow(RangeError);
    });

    it("throws when there are not enough cards", () => {
      const c = make<number>([1, 2, 3]);
      const a = stubContainer<number>();
      const b = stubContainer<number>();
      // 2 cards × 2 containers = 4 needed, only 3 present.
      expect(() => c.deal([a, b], 2)).toThrow(RangeError);
      // Source unchanged on failure.
      expect(c.size).toBe(3);
      expect(a.received).toEqual([]);
    });

    it("uses each container's own add() semantics", () => {
      // Deck.add puts on bottom; Hand.add appends. Use a stub that records.
      const a = stubContainer<string>();
      const c = new CardCollection<string>(mulberry32(1), ["x", "y"]);
      c.deal([a], 2);
      expect(a.received).toEqual(["y", "x"]);
    });
  });
});
