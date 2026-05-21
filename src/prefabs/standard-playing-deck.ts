import type { Card, DiscreteAttribute, IntegerAttribute } from "../card/card.js";
import { Deck } from "../deck/deck.js";
import type { Rng } from "../rng/rng.js";

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

/** Indexed by `rank - 1`. RANK_NAMES[0] = "Ace", RANK_NAMES[12] = "King". */
export const RANK_NAMES = [
  "Ace",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Jack",
  "Queen",
  "King",
] as const;

export const JOKER_COLORS = ["red", "black"] as const;
export type JokerColor = (typeof JOKER_COLORS)[number];

export type RankName = (typeof RANK_NAMES)[number];

/** Attribute shape for the 52 standard cards. */
export type StandardCardAttrs = {
  readonly rank: IntegerAttribute;
  readonly suit: DiscreteAttribute<Suit>;
};

/** Attribute shape for joker cards. */
export type JokerAttrs = {
  readonly joker: DiscreteAttribute<JokerColor>;
};

/**
 * Convenience methods present on every card in a `standardPlayingDeck`.
 * On suited cards they return the rank value and its name; on jokers
 * both return `undefined`.
 */
export interface PlayingCardOps {
  rankOf(): number | undefined;
  rankNameOf(): RankName | undefined;
}

/**
 * Either a suited card (`{ rank, suit }`) or a joker (`{ joker }`).
 * Narrow with `"joker" in card.attrs`. Every card also carries the
 * `rankOf` / `rankNameOf` accessors from `PlayingCardOps`.
 */
export type StandardPlayingCard =
  | (Card<StandardCardAttrs> & PlayingCardOps)
  | (Card<JokerAttrs> & PlayingCardOps);

export interface StandardPlayingDeckOptions {
  /** Append two distinguishable jokers (red, black). Defaults to `false`. */
  readonly jokers?: boolean;
}

/**
 * Look up the integer rank (1..13) for a rank name like "Ace" or "King".
 * Returns `undefined` for unrecognized names.
 */
export function rankFromName(name: string): number | undefined {
  const idx = RANK_NAMES.indexOf(name as RankName);
  return idx >= 0 ? idx + 1 : undefined;
}

function suitedCard(suit: Suit, rank: number): Card<StandardCardAttrs> & PlayingCardOps {
  const rankName = RANK_NAMES[rank - 1] as RankName;
  return {
    name: `${rankName} of ${suit}`,
    attrs: {
      rank: { kind: "integer", value: rank, min: 1, max: 13 },
      suit: { kind: "discrete", value: suit, options: SUITS },
    },
    rankOf: () => rank,
    rankNameOf: () => rankName,
  };
}

function jokerCard(color: JokerColor): Card<JokerAttrs> & PlayingCardOps {
  return {
    name: `${color === "red" ? "Red" : "Black"} Joker`,
    attrs: {
      joker: { kind: "discrete", value: color, options: JOKER_COLORS },
    },
    rankOf: () => undefined,
    rankNameOf: () => undefined,
  };
}

/**
 * Build a fresh 52-card playing deck (or 54-card with `{ jokers: true }`).
 *
 * The deck is **not** pre-shuffled — call `deck.shuffle()` for randomized
 * order, matching the explicit-randomness convention used elsewhere.
 *
 * The top of the deck (drawn first) is the last card added: with jokers
 * enabled, that's the Black Joker; without, it's the King of clubs.
 */
export function standardPlayingDeck(
  rng: Rng,
  opts?: StandardPlayingDeckOptions,
): Deck<StandardPlayingCard> {
  const cards: StandardPlayingCard[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      cards.push(suitedCard(suit, rank));
    }
  }
  if (opts?.jokers) {
    cards.push(jokerCard("red"));
    cards.push(jokerCard("black"));
  }
  return new Deck<StandardPlayingCard>(cards, rng);
}
