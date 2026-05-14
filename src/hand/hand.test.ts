import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32.js";
import { Hand } from "./hand.js";

const makeHand = <T>(initial: readonly T[] = [], seed = 1) =>
  new Hand<T>("alice", mulberry32(seed), initial);

describe("Hand", () => {
  it("starts with the provided cards", () => {
    const h = makeHand<number>([1, 2, 3]);
    expect(h.size).toBe(3);
  });

  it("add accepts single card or array", () => {
    const h = makeHand<number>();
    h.add(1);
    h.add([2, 3]);
    expect(h.size).toBe(3);
  });

  it("contains returns true when a card matches", () => {
    const h = makeHand<number>([1, 2, 3]);
    expect(h.contains((c) => c === 2)).toBe(true);
    expect(h.contains((c) => c === 99)).toBe(false);
  });

  it("remove pulls the first matching card", () => {
    const h = makeHand<number>([1, 2, 3, 2]);
    const removed = h.remove((c) => c === 2);
    expect(removed).toBe(2);
    expect(h.size).toBe(3);
  });

  it("remove returns undefined when nothing matches", () => {
    const h = makeHand<number>([1, 2]);
    expect(h.remove((c) => c === 99)).toBeUndefined();
    expect(h.size).toBe(2);
  });

  it("shuffle is deterministic for the same seed", () => {
    const a = new Hand<number>("alice", mulberry32(42), [1, 2, 3, 4, 5, 6, 7]);
    const b = new Hand<number>("alice", mulberry32(42), [1, 2, 3, 4, 5, 6, 7]);
    a.shuffle();
    b.shuffle();
    expect(a.reveal()).toEqual(b.reveal());
  });

  it("shuffle preserves all cards", () => {
    const h = makeHand<number>([1, 2, 3, 4, 5]);
    h.shuffle();
    expect(h.size).toBe(5);
    expect(h.reveal().slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("owner sees their cards", () => {
    const h = makeHand<number>([1, 2, 3]);
    const view = h.viewFor("alice");
    expect(view.ownerId).toBe("alice");
    expect(view.count).toBe(3);
    expect(view.cards).toEqual([1, 2, 3]);
  });

  it("non-owners see only the count, not the cards", () => {
    const h = makeHand<number>([1, 2, 3]);
    const view = h.viewFor("bob");
    expect(view.count).toBe(3);
    expect(view.cards).toBeUndefined();
  });

  it("reveal returns all cards regardless of viewer", () => {
    const h = makeHand<number>([7, 8]);
    expect(h.reveal()).toEqual([7, 8]);
  });

  it("viewFor returns a defensive copy", () => {
    const h = makeHand<number>([1, 2]);
    const view = h.viewFor("alice");
    (view.cards as number[]).push(99);
    expect(h.size).toBe(2);
  });
});
