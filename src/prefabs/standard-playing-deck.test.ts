import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32.js";
import {
  RANK_NAMES,
  SUITS,
  type StandardPlayingCard,
  standardPlayingDeck,
} from "./standard-playing-deck.js";

const drainDeck = (deck: ReturnType<typeof standardPlayingDeck>) =>
  deck.tryDraw(999);

describe("standardPlayingDeck", () => {
  it("returns 52 cards by default", () => {
    const deck = standardPlayingDeck(mulberry32(1));
    expect(deck.size).toBe(52);
  });

  it("returns 54 cards with jokers enabled", () => {
    const deck = standardPlayingDeck(mulberry32(1), { jokers: true });
    expect(deck.size).toBe(54);
  });

  it("contains every (suit, rank) pair exactly once", () => {
    const deck = standardPlayingDeck(mulberry32(1));
    const cards = drainDeck(deck);
    const seen = new Set<string>();
    for (const c of cards) {
      if ("joker" in c.attrs) throw new Error("unexpected joker in default deck");
      seen.add(`${c.attrs.suit.value}|${c.attrs.rank.value}`);
    }
    expect(seen.size).toBe(52);
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        expect(seen.has(`${suit}|${rank}`)).toBe(true);
      }
    }
  });

  it("names cards using RANK_NAMES and the suit", () => {
    const deck = standardPlayingDeck(mulberry32(1));
    const cards = drainDeck(deck);
    for (const c of cards) {
      if ("joker" in c.attrs) continue;
      const expected = `${RANK_NAMES[c.attrs.rank.value - 1]} of ${c.attrs.suit.value}`;
      expect(c.name).toBe(expected);
    }
  });

  it("includes both red and black jokers when enabled", () => {
    const deck = standardPlayingDeck(mulberry32(1), { jokers: true });
    const cards = drainDeck(deck);
    const jokers = cards.filter(
      (c): c is Extract<StandardPlayingCard, { attrs: { joker: unknown } }> =>
        "joker" in c.attrs,
    );
    expect(jokers).toHaveLength(2);
    const colors = jokers.map((j) => j.attrs.joker.value).sort();
    expect(colors).toEqual(["black", "red"]);
  });

  it("rank attributes carry min/max bounds", () => {
    const deck = standardPlayingDeck(mulberry32(1));
    const [top] = deck.draw(1);
    if (!top || "joker" in top.attrs) throw new Error("expected suited card");
    expect(top.attrs.rank.min).toBe(1);
    expect(top.attrs.rank.max).toBe(13);
  });

  it("is not pre-shuffled — order is deterministic from constructor order", () => {
    const a = standardPlayingDeck(mulberry32(1));
    const b = standardPlayingDeck(mulberry32(999));
    // Without shuffling, identical seeds are irrelevant: the order is fixed.
    expect(drainDeck(a)).toEqual(drainDeck(b));
  });

  it("shuffles deterministically with a given seed", () => {
    const a = standardPlayingDeck(mulberry32(42));
    a.shuffle();
    const b = standardPlayingDeck(mulberry32(42));
    b.shuffle();
    expect(drainDeck(a).map((c) => c.name)).toEqual(
      drainDeck(b).map((c) => c.name),
    );
  });
});
