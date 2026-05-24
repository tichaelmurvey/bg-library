import { describe, expect, it, vi } from "vitest";
import { Hand } from "../hand/hand.js";
import { mulberry32 } from "../rng/mulberry32.js";
import { type DealStrategy, Deck } from "./deck.js";

const makeDeck = () => new Deck<number>([1, 2, 3, 4, 5], mulberry32(1));

describe("Deck", () => {
  it("reports size and has no linked discard pile by default", () => {
    const deck = makeDeck();
    expect(deck.size).toBe(5);
    expect(deck.discardPile).toBeUndefined();
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

  it("move transfers the first matching card from the draw pile to the destination", () => {
    const deck = makeDeck();
    const dest = new Deck<number>([], mulberry32(1));
    const moved = deck.move((c) => c === 3, dest);
    expect(moved).toBe(3);
    expect(deck.size).toBe(4);
    expect(deck.contains((c) => c === 3)).toBe(false);
    expect(dest.contains((c) => c === 3)).toBe(true);
  });

  it("move returns undefined when nothing matches", () => {
    const deck = makeDeck();
    const dest = new Deck<number>([], mulberry32(1));
    expect(deck.move((c) => c === 99, dest)).toBeUndefined();
    expect(deck.size).toBe(5);
  });

  describe("id", () => {
    it("auto-generates a unique id when none is provided", () => {
      const a = new Deck<number>([1], mulberry32(1));
      const b = new Deck<number>([1], mulberry32(1));
      expect(a.id).not.toBe(b.id);
      expect(typeof a.id).toBe("string");
      expect(a.id.length).toBeGreaterThan(0);
    });

    it("uses the explicit id when provided", () => {
      const deck = new Deck<number>([1, 2], mulberry32(1), { id: "deck-A" });
      expect(deck.id).toBe("deck-A");
    });
  });

  describe("discard pile linkage", () => {
    it("can be linked at construction", () => {
      const discard = new Deck<number>([], mulberry32(2), { id: "discard-1" });
      const main = new Deck<number>([1, 2, 3], mulberry32(1), { discardPile: discard });
      expect(main.discardPile).toBe(discard);
    });

    it("can be linked and unlinked at runtime", () => {
      const main = new Deck<number>([1, 2, 3], mulberry32(1));
      const discard = new Deck<number>([], mulberry32(2));
      main.setDiscardPile(discard);
      expect(main.discardPile).toBe(discard);
      main.setDiscardPile(undefined);
      expect(main.discardPile).toBeUndefined();
    });
  });

  describe("reshuffleDiscardIntoDeck", () => {
    it("drains the linked discard pile back into the main deck and shuffles", () => {
      const main = new Deck<number>([1, 2], mulberry32(1));
      const discard = new Deck<number>([], mulberry32(2));
      main.setDiscardPile(discard);
      // Move three cards into the discard pile.
      discard.add([10, 11, 12]);
      expect(main.size).toBe(2);
      expect(discard.size).toBe(3);

      main.reshuffleDiscardIntoDeck();
      expect(main.size).toBe(5);
      expect(discard.size).toBe(0);
    });

    it("warns and no-ops when no discard pile is linked", () => {
      const main = makeDeck();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      main.reshuffleDiscardIntoDeck();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(main.size).toBe(5);
      warn.mockRestore();
    });

    it("returns silently when the linked discard pile is empty", () => {
      const main = new Deck<number>([1, 2], mulberry32(1));
      const discard = new Deck<number>([], mulberry32(2));
      main.setDiscardPile(discard);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      main.reshuffleDiscardIntoDeck();
      expect(warn).not.toHaveBeenCalled();
      expect(main.size).toBe(2);
      warn.mockRestore();
    });
  });

  describe("deal", () => {
    const makeHands = (_ids: readonly string[]) =>
      _ids.map(() => new Hand<number>(mulberry32(100)));

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

    it("'reshuffle' pulls from the linked discard pile to complete the deal", () => {
      const deck = new Deck<number>([1, 2, 3], mulberry32(1));
      const discard = new Deck<number>([10, 11, 12, 13], mulberry32(2));
      deck.setDiscardPile(discard);
      const hands = makeHands(["a", "b"]);
      deck.deal(hands, 3, "reshuffle");
      // Need 6 cards; 3 from deck, 3 from reshuffled discard. 7 total - 6 = 1 left.
      expect(hands.map((h) => h.size)).toEqual([3, 3]);
      expect(deck.size + discard.size).toBe(1);
    });

    it("'reshuffle' throws if no discard pile is linked", () => {
      const deck = new Deck<number>([1, 2], mulberry32(1));
      const hands = makeHands(["a"]);
      expect(() => deck.deal(hands, 5, "reshuffle")).toThrow(RangeError);
    });

    it("'reshuffle' throws if both draw and discard piles are exhausted", () => {
      const deck = new Deck<number>([1, 2], mulberry32(1));
      const discard = new Deck<number>([], mulberry32(2));
      deck.setDiscardPile(discard);
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
      const deck = new Deck<number>([1, 2, 3, 4, 5, 6, 7, 8, 9], mulberry32(1), { config });
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

  describe("toJSON / fromJSON", () => {
    it("snapshot carries id and draw, no discardPileId when unlinked", () => {
      const deck = new Deck<number>([1, 2, 3], mulberry32(1), { id: "main" });
      const snap = deck.toJSON();
      expect(snap.id).toBe("main");
      expect(snap.draw).toEqual([1, 2, 3]);
      expect(snap.discardPileId).toBeUndefined();
    });

    it("snapshot carries discardPileId when a discard pile is linked", () => {
      const discard = new Deck<number>([], mulberry32(2), { id: "discard-A" });
      const main = new Deck<number>([1, 2, 3], mulberry32(1), {
        id: "main",
        discardPile: discard,
      });
      const snap = main.toJSON();
      expect(snap.discardPileId).toBe("discard-A");
    });

    it("fromJSON restores id and draw but does not auto-relink the discard pile", () => {
      const discard = new Deck<number>([], mulberry32(2), { id: "discard-A" });
      const main = new Deck<number>([7, 8, 9], mulberry32(1), {
        id: "main",
        discardPile: discard,
      });
      const snap = main.toJSON();
      const restored = Deck.fromJSON(snap, mulberry32(1));
      expect(restored.id).toBe("main");
      expect(restored.size).toBe(3);
      expect(restored.discardPile).toBeUndefined();
      // Caller is responsible for relinking using the snapshot's discardPileId.
      expect(snap.discardPileId).toBe("discard-A");
    });
  });
});
