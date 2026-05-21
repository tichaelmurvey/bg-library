import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32.js";
import {
  RANK_NAMES,
  SUITS,
  type StandardPlayingCard,
  rankFromName,
  standardPlayingDeck,
} from "./standard-playing-deck.js";

const drainDeck = (deck: ReturnType<typeof standardPlayingDeck>) => deck.tryDraw(999);

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
      (c): c is Extract<StandardPlayingCard, { attrs: { joker: unknown } }> => "joker" in c.attrs,
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

  it("rankFromName maps rank names back to integer ranks", () => {
    expect(rankFromName("Ace")).toBe(1);
    expect(rankFromName("Ten")).toBe(10);
    expect(rankFromName("King")).toBe(13);
    expect(rankFromName("Joker")).toBeUndefined();
    expect(rankFromName("")).toBeUndefined();
  });

  it("count('rank') aggregates the deck by rank, skipping jokers", () => {
    const deck = standardPlayingDeck(mulberry32(1), { jokers: true });
    const byRank = deck.count("rank");
    // 13 distinct ranks, 4 of each. Jokers contribute nothing.
    expect(byRank.size).toBe(13);
    for (let r = 1; r <= 13; r++) expect(byRank.get(r)).toBe(4);
    // 54 total cards − 2 jokers = 52 accounted for here.
    let total = 0;
    for (const c of byRank.values()) total += c;
    expect(total).toBe(52);
  });

  it("count('suit') aggregates the deck by suit, skipping jokers", () => {
    const deck = standardPlayingDeck(mulberry32(1), { jokers: true });
    const bySuit = deck.count("suit");
    expect(bySuit.size).toBe(4);
    for (const s of SUITS) expect(bySuit.get(s)).toBe(13);
  });

  it("count('joker') aggregates only the joker colors", () => {
    const deck = standardPlayingDeck(mulberry32(1), { jokers: true });
    const byJoker = deck.count("joker");
    expect(byJoker.size).toBe(2);
    expect(byJoker.get("red")).toBe(1);
    expect(byJoker.get("black")).toBe(1);
  });

  it("rankOf/rankNameOf return rank info on suited cards and undefined on jokers", () => {
    const deck = standardPlayingDeck(mulberry32(1), { jokers: true });
    const cards = drainDeck(deck);
    for (const c of cards) {
      if ("joker" in c.attrs) {
        expect(c.rankOf()).toBeUndefined();
        expect(c.rankNameOf()).toBeUndefined();
      } else {
        const r = c.rankOf();
        expect(r).toBe(c.attrs.rank.value);
        expect(typeof r).toBe("number");
        expect(c.rankNameOf()).toBe(RANK_NAMES[(r ?? 0) - 1]);
      }
    }
  });

  it("is not pre-shuffled — order is deterministic from constructor order", () => {
    const a = standardPlayingDeck(mulberry32(1));
    const b = standardPlayingDeck(mulberry32(999));
    // Without shuffling, identical seeds are irrelevant: the order is fixed.
    // Compare names rather than full objects since cards carry closure-bound
    // accessor methods that are distinct between instances.
    expect(drainDeck(a).map((c) => c.name)).toEqual(drainDeck(b).map((c) => c.name));
  });

  it("shuffles deterministically with a given seed", () => {
    const a = standardPlayingDeck(mulberry32(42));
    a.shuffle();
    const b = standardPlayingDeck(mulberry32(42));
    b.shuffle();
    expect(drainDeck(a).map((c) => c.name)).toEqual(drainDeck(b).map((c) => c.name));
  });
});
