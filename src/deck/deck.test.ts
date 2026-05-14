import { describe, expect, it } from "vitest";
import { Hand } from "../hand/hand.js";
import { mulberry32 } from "../rng/mulberry32.js";
import { type DealStrategy, Deck } from "./deck.js";

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

  it("add puts cards on the bottom of the draw pile", () => {
    const deck = makeDeck();
    deck.add(0);
    // 0 went to the bottom; original top (5) should still draw first.
    expect(deck.draw(1)).toEqual([5]);
    // ...and 0 should come out last.
    const remaining = deck.tryDraw(99);
    expect(remaining[remaining.length - 1]).toBe(0);
  });

  it("add accepts arrays", () => {
    const deck = new Deck<number>([1, 2], mulberry32(1));
    deck.add([10, 11]);
    expect(deck.size).toBe(4);
    expect(deck.draw(1)).toEqual([2]); // top unchanged
  });

  it("contains checks the draw pile", () => {
    const deck = makeDeck();
    expect(deck.contains((c) => c === 3)).toBe(true);
    expect(deck.contains((c) => c === 99)).toBe(false);
  });

  it("contains does not search the discard pile", () => {
    const deck = makeDeck();
    deck.discard(deck.draw(1)); // 5 -> discard
    expect(deck.contains((c) => c === 5)).toBe(false);
  });

  it("remove pulls the first matching card from the draw pile", () => {
    const deck = makeDeck();
    const removed = deck.remove((c) => c === 3);
    expect(removed).toBe(3);
    expect(deck.size).toBe(4);
    expect(deck.contains((c) => c === 3)).toBe(false);
  });

  it("remove returns undefined when nothing matches", () => {
    const deck = makeDeck();
    expect(deck.remove((c) => c === 99)).toBeUndefined();
    expect(deck.size).toBe(5);
  });

  describe("deal", () => {
    const makeHands = (ids: readonly string[]) =>
      ids.map((id) => new Hand<number>(id, mulberry32(100)));

    it("uses 'full-rounds' to deal only complete rounds, leaving leftovers", () => {
      const deck = new Deck<number>([1, 2, 3, 4, 5, 6, 7], mulberry32(1));
      const hands = makeHands(["a", "b", "c"]);
      deck.deal(hands, 3, "full-rounds");
      // floor(7 / 3) = 2 full rounds; 6 cards dealt, 1 left.
      expect(hands.map((h) => h.size)).toEqual([2, 2, 2]);
      expect(deck.size).toBe(1);
    });

    it("'full-rounds' is capped at the requested n", () => {
      const deck = new Deck<number>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mulberry32(1));
      const hands = makeHands(["a", "b"]);
      deck.deal(hands, 2, "full-rounds");
      // n=2 wins over floor(10/2)=5.
      expect(hands.map((h) => h.size)).toEqual([2, 2]);
      expect(deck.size).toBe(6);
    });

    it("'exhaust' is the default and may produce a partial last round", () => {
      const deck = new Deck<number>([1, 2, 3, 4, 5], mulberry32(1));
      const hands = makeHands(["a", "b", "c"]);
      deck.deal(hands, 3);
      // 5 cards, 3 targets: a,b,c then a,b — c never gets a second card.
      expect(hands.map((h) => h.size)).toEqual([2, 2, 1]);
      expect(deck.size).toBe(0);
    });

    it("'exhaust' is a no-op when the deck is already empty", () => {
      const deck = new Deck<number>([], mulberry32(1));
      const hands = makeHands(["a"]);
      deck.deal(hands, 5, "exhaust");
      expect(hands[0]?.size).toBe(0);
    });

    it("'reshuffle' pulls from the discard pile to complete the deal", () => {
      const deck = new Deck<number>([1, 2, 3], mulberry32(1));
      deck.discard([10, 11, 12, 13]);
      const hands = makeHands(["a", "b"]);
      deck.deal(hands, 3, "reshuffle");
      // Need 6 cards; 3 from deck, 3 from reshuffled discard. 7 total - 6 = 1 left.
      expect(hands.map((h) => h.size)).toEqual([3, 3]);
      expect(deck.size + deck.discardSize).toBe(1);
    });

    it("'reshuffle' throws if both draw and discard piles are exhausted", () => {
      const deck = new Deck<number>([1, 2], mulberry32(1));
      const hands = makeHands(["a"]);
      expect(() => deck.deal(hands, 5, "reshuffle")).toThrow(RangeError);
    });

    it("uses the deck-level config strategy when no per-call override is given", () => {
      const config = { dealStrategy: "full-rounds" as DealStrategy };
      const deck = new Deck<number>([1, 2, 3, 4, 5], mulberry32(1), { config });
      const hands = makeHands(["a", "b"]);
      deck.deal(hands, 3);
      // full-rounds: floor(5/2) = 2 rounds, capped at 3 → 2 rounds, 4 dealt.
      expect(hands.map((h) => h.size)).toEqual([2, 2]);
      expect(deck.size).toBe(1);
    });

    it("per-call strategy overrides the deck-level config", () => {
      const config = { dealStrategy: "full-rounds" as DealStrategy };
      const deck = new Deck<number>([1, 2, 3, 4, 5], mulberry32(1), { config });
      const hands = makeHands(["a", "b"]);
      deck.deal(hands, 3, "exhaust");
      expect(hands.map((h) => h.size)).toEqual([3, 2]);
      expect(deck.size).toBe(0);
    });

    it("re-reads the config on every call (live mutation between calls)", () => {
      const config: { dealStrategy?: DealStrategy } = { dealStrategy: "full-rounds" };
      const deck = new Deck<number>(
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        mulberry32(1),
        { config },
      );
      const hands = makeHands(["a"]);
      deck.deal(hands, 2);
      expect(hands[0]?.size).toBe(2);
      expect(deck.size).toBe(7);

      config.dealStrategy = "exhaust";
      deck.deal(hands, 999);
      expect(hands[0]?.size).toBe(9);
      expect(deck.size).toBe(0);
    });

    it("draws from the top, round-robin", () => {
      const deck = new Deck<number>([1, 2, 3, 4, 5, 6], mulberry32(1));
      const hands = makeHands(["a", "b"]);
      deck.deal(hands, 2, "full-rounds");
      // Top card is 6. r1: a=6, b=5. r2: a=4, b=3.
      expect(hands[0]?.reveal()).toEqual([6, 4]);
      expect(hands[1]?.reveal()).toEqual([5, 3]);
    });

    it("throws on negative n", () => {
      const deck = new Deck<number>([1, 2, 3], mulberry32(1));
      expect(() => deck.deal(makeHands(["a"]), -1)).toThrow(RangeError);
    });

    it("throws on empty targets", () => {
      const deck = new Deck<number>([1, 2, 3], mulberry32(1));
      expect(() => deck.deal([], 1)).toThrow(RangeError);
    });

    it("n=0 is a no-op", () => {
      const deck = new Deck<number>([1, 2, 3], mulberry32(1));
      const hands = makeHands(["a"]);
      deck.deal(hands, 0);
      expect(hands[0]?.size).toBe(0);
      expect(deck.size).toBe(3);
    });
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
