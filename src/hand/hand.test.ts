import { describe, expect, it } from "vitest";
import type { Card, DiscreteAttribute, IntegerAttribute } from "../card/card.js";
import { mulberry32 } from "../rng/mulberry32.js";
import { Hand } from "./hand.js";

const testPlayer = { id: "alice", decide: async () => ({ type: "noop" as const, params: {} }) };

const makeHand = <T>(initial: readonly T[] = [], seed = 1) =>
  new Hand<T>(mulberry32(seed), initial, { player: testPlayer });

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

  it("move transfers the first matching card to the destination", () => {
    const h = makeHand<number>([1, 2, 3, 2]);
    const dest = new Hand<number>(mulberry32(1));
    const moved = h.move((c) => c === 2, dest);
    expect(moved).toBe(2);
    expect(h.size).toBe(3);
    expect(dest.size).toBe(1);
    expect(dest.contains((c) => c === 2)).toBe(true);
  });

  it("move returns undefined when nothing matches", () => {
    const h = makeHand<number>([1, 2]);
    const dest = new Hand<number>(mulberry32(1));
    expect(h.move((c) => c === 99, dest)).toBeUndefined();
    expect(h.size).toBe(2);
    expect(dest.size).toBe(0);
  });

  it("shuffle is deterministic for the same seed", () => {
    const a = new Hand<number>(mulberry32(42), [1, 2, 3, 4, 5, 6, 7], { player: testPlayer });
    const b = new Hand<number>(mulberry32(42), [1, 2, 3, 4, 5, 6, 7], { player: testPlayer });
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

  it("isPrivate defaults to true", () => {
    const h = makeHand<number>([1, 2]);
    expect(h.isPrivate).toBe(true);
  });

  it("non-private hands show their cards to every viewer", () => {
    const h = new Hand<number>(mulberry32(1), [1, 2, 3], { isPrivate: false });
    expect(h.isPrivate).toBe(false);
    expect(h.viewFor("alice").cards).toEqual([1, 2, 3]);
    expect(h.viewFor("bob").cards).toEqual([1, 2, 3]);
  });

  it("starts with no linked player by default", () => {
    const h = new Hand<number>(mulberry32(1));
    expect(h.player).toBeUndefined();
  });

  it("accepts a player reference at construction and via assignment", () => {
    const fakePlayer = {
      id: "alice",
      decide: async () => ({ type: "noop", params: {} }),
    } as const;
    const h = new Hand<number>(mulberry32(1), [], { player: fakePlayer });
    expect(h.player).toBe(fakePlayer);
    h.player = undefined;
    expect(h.player).toBeUndefined();
    h.player = fakePlayer;
    expect(h.player).toBe(fakePlayer);
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

  describe("count", () => {
    type Color = "red" | "blue" | "green";
    type ColoredAttrs = {
      readonly rank: IntegerAttribute;
      readonly color: DiscreteAttribute<Color>;
    };
    type ColoredCard = Card<ColoredAttrs>;
    const card = (rank: number, color: Color): ColoredCard => ({
      name: `${color}-${rank}`,
      attrs: {
        rank: { kind: "integer", value: rank },
        color: { kind: "discrete", value: color, options: ["red", "blue", "green"] },
      },
    });

    it("groups by an integer attribute", () => {
      const h = new Hand<ColoredCard>(mulberry32(1), [
        card(3, "red"),
        card(3, "blue"),
        card(5, "red"),
      ]);
      const byRank = h.count("rank");
      expect(byRank.get(3)).toBe(2);
      expect(byRank.get(5)).toBe(1);
      expect(byRank.size).toBe(2);
    });

    it("groups by a discrete attribute", () => {
      const h = new Hand<ColoredCard>(mulberry32(1), [
        card(3, "red"),
        card(3, "blue"),
        card(5, "red"),
      ]);
      const byColor = h.count("color");
      expect(byColor.get("red")).toBe(2);
      expect(byColor.get("blue")).toBe(1);
      expect(byColor.get("green")).toBeUndefined();
    });

    it("returns an empty map when the hand is empty", () => {
      const h = new Hand<ColoredCard>(mulberry32(1));
      expect(h.count("rank").size).toBe(0);
    });

    it("valuesOf returns distinct values in first-seen order", () => {
      const h = new Hand<ColoredCard>(mulberry32(1), [
        card(7, "blue"),
        card(3, "red"),
        card(3, "blue"),
        card(7, "green"),
      ]);
      expect(h.valuesOf("rank")).toEqual([7, 3]);
      expect(h.valuesOf("color")).toEqual(["blue", "red", "green"]);
    });

    it("valuesOf returns an empty array when the hand is empty", () => {
      const h = new Hand<ColoredCard>(mulberry32(1));
      expect(h.valuesOf("rank")).toEqual([]);
    });

    it("skips cards whose union branch lacks the requested field", () => {
      type EitherCard =
        | Card<{ readonly rank: IntegerAttribute }>
        | Card<{ readonly color: DiscreteAttribute<Color> }>;
      const ranked: EitherCard = { name: "r3", attrs: { rank: { kind: "integer", value: 3 } } };
      const colored: EitherCard = {
        name: "red",
        attrs: { color: { kind: "discrete", value: "red", options: ["red", "blue", "green"] } },
      };
      const h = new Hand<EitherCard>(mulberry32(1), [ranked, colored, ranked]);
      const byRank = h.count("rank");
      expect(byRank.get(3)).toBe(2);
      expect(byRank.size).toBe(1);
    });
  });
});
