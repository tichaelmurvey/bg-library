import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32.js";
import { Deck } from "./deck.js";

const makeDeck = () => new Deck<number>([1, 2, 3, 4, 5], mulberry32(1));

describe("Deck", () => {
  it("reports size and discardSize correctly", () => {
    const deck = makeDeck();
    expect(deck.size).toBe(5);
    expect(deck.discardSize).toBe(0);
  });

  it("draws from the top of the deck", () => {
    const deck = makeDeck();
    const [top] = deck.draw(1);
    expect(top).toBe(5);
    expect(deck.size).toBe(4);
  });

  it("draws multiple in top-down order", () => {
    const deck = makeDeck();
    expect(deck.draw(3)).toEqual([5, 4, 3]);
  });

  it("throws on underflow", () => {
    const deck = makeDeck();
    expect(() => deck.draw(10)).toThrow(RangeError);
  });

  it("tryDraw returns up to n without throwing", () => {
    const deck = makeDeck();
    expect(deck.tryDraw(99)).toEqual([5, 4, 3, 2, 1]);
    expect(deck.size).toBe(0);
  });

  it("peek does not mutate", () => {
    const deck = makeDeck();
    expect(deck.peek(2)).toEqual([5, 4]);
    expect(deck.size).toBe(5);
  });

  it("discard accepts single card or array", () => {
    const deck = makeDeck();
    deck.discard(deck.draw(1));
    deck.discard(99);
    expect(deck.discardSize).toBe(2);
  });

  it("reshuffleDiscardIntoDeck moves discard back", () => {
    const deck = makeDeck();
    deck.discard(deck.draw(3));
    expect(deck.size).toBe(2);
    expect(deck.discardSize).toBe(3);
    deck.reshuffleDiscardIntoDeck();
    expect(deck.size).toBe(5);
    expect(deck.discardSize).toBe(0);
  });

  it("shuffle is deterministic for same seed", () => {
    const a = new Deck<number>([1, 2, 3, 4, 5, 6, 7], mulberry32(42));
    const b = new Deck<number>([1, 2, 3, 4, 5, 6, 7], mulberry32(42));
    a.shuffle();
    b.shuffle();
    expect(a.toJSON().draw).toEqual(b.toJSON().draw);
  });

  it("round-trips through toJSON/fromJSON", () => {
    const deck = makeDeck();
    deck.discard(deck.draw(2));
    const snap = deck.toJSON();
    const restored = Deck.fromJSON(snap, mulberry32(1));
    expect(restored.size).toBe(deck.size);
    expect(restored.discardSize).toBe(deck.discardSize);
    expect(restored.toJSON()).toEqual(snap);
  });
});
