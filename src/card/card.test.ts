import { describe, expect, it } from "vitest";
import type { Card, CardAttribute, DiscreteAttribute, IntegerAttribute } from "./card.js";

describe("Card", () => {
  it("constructs a typed card with named attributes", () => {
    type Attrs = {
      readonly rank: IntegerAttribute;
      readonly suit: DiscreteAttribute<"spades" | "hearts">;
    };
    const card: Card<Attrs> = {
      name: "Ace of Spades",
      attrs: {
        rank: { kind: "integer", value: 1, min: 1, max: 13 },
        suit: { kind: "discrete", value: "spades", options: ["spades", "hearts"] },
      },
    };

    expect(card.name).toBe("Ace of Spades");
    expect(card.attrs.rank.value).toBe(1);
    expect(card.attrs.suit.value).toBe("spades");
  });

  it("iterates attributes uniformly via Object.entries", () => {
    const card: Card = {
      name: "Test",
      attrs: {
        a: { kind: "integer", value: 7 },
        b: { kind: "discrete", value: "x", options: ["x", "y"] },
      },
    };
    const entries = Object.entries(card.attrs);
    expect(entries).toHaveLength(2);
    const kinds = entries.map(([, attr]) => attr.kind).sort();
    expect(kinds).toEqual(["discrete", "integer"]);
  });

  it("narrows attribute kind via the `kind` discriminator", () => {
    const attr: CardAttribute = { kind: "integer", value: 4, min: 0, max: 10 };
    if (attr.kind === "integer") {
      // TS should let us read min/max here without casting.
      expect(attr.min).toBe(0);
      expect(attr.max).toBe(10);
    } else {
      throw new Error("expected integer kind");
    }
  });

  it("supports cards with different `attrs` shapes in a union", () => {
    type WithRank = { readonly rank: IntegerAttribute };
    type WithEffect = { readonly effect: DiscreteAttribute<"draw" | "skip"> };
    type EitherCard = Card<WithRank> | Card<WithEffect>;

    const cards: EitherCard[] = [
      {
        name: "Three",
        attrs: { rank: { kind: "integer", value: 3 } },
      },
      {
        name: "Draw Two",
        attrs: {
          effect: { kind: "discrete", value: "draw", options: ["draw", "skip"] },
        },
      },
    ];

    let drawCount = 0;
    for (const c of cards) {
      if ("rank" in c.attrs) {
        expect(c.attrs.rank.value).toBe(3);
      } else {
        expect(c.attrs.effect.value).toBe("draw");
        drawCount++;
      }
    }
    expect(drawCount).toBe(1);
  });
});
