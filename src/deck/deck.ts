import { CardCollection } from "../card-container/card-collection.js";
import type { CardContainer } from "../card-container/card-container.js";
import type { Rng } from "../rng/rng.js";

export interface DeckSnapshot<TCard> {
  readonly draw: readonly TCard[];
  readonly discard: readonly TCard[];
}

/**
 * Underflow handling for `Deck.deal`.
 *
 * - `"full-rounds"` — deal only complete rounds (`floor(size / targets.length)`),
 *   capped at the requested `n`. Leftovers remain in the deck.
 * - `"exhaust"` — deal round-robin until either `n` rounds are complete or
 *   the deck is empty. The final round may be partial.
 * - `"reshuffle"` — deal `n` full rounds, calling `reshuffleDiscardIntoDeck`
 *   whenever the draw pile is exhausted. Throws `RangeError` if both the
 *   draw pile and discard pile are empty before `n` rounds complete.
 */
export type DealStrategy = "full-rounds" | "exhaust" | "reshuffle";

export interface DeckOptions {
  /**
   * Optional shared config whose `dealStrategy` is the deck-level default
   * for `deal()`. Read fresh on each call, so mutating it between calls
   * (e.g. on a phase transition) is picked up immediately.
   */
  readonly config?: { dealStrategy?: DealStrategy };
}

export class Deck<TCard> implements CardContainer<TCard> {
  private readonly drawPile: CardCollection<TCard>;
  private discardPile: TCard[] = [];
  private readonly options: DeckOptions | undefined;

  constructor(cards: readonly TCard[], rng: Rng, options?: DeckOptions) {
    this.drawPile = new CardCollection<TCard>(rng, cards);
    this.options = options;
  }

  get size(): number {
    return this.drawPile.size;
  }

  get discardSize(): number {
    return this.discardPile.length;
  }

  shuffle(): void {
    this.drawPile.shuffle();
  }

  draw(n = 1): TCard[] {
    return this.drawPile.takeFromEnd(n).reverse();
  }

  tryDraw(n: number): TCard[] {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`tryDraw(n) requires a non-negative integer, got ${n}`);
    }
    return this.draw(Math.min(n, this.drawPile.size));
  }

  /**
   * Deal `n` cards to each target, round-robin from the top of the deck.
   * Underflow is governed by `strategy` (per-call) → `config.dealStrategy`
   * (deck-level) → `"exhaust"` (library default). See `DealStrategy` for
   * the semantics of each strategy.
   *
   * Throws `RangeError` if `n` is negative or non-integer, if `targets`
   * is empty, or if the chosen strategy cannot satisfy the request (see
   * `DealStrategy`).
   */
  deal(
    targets: readonly CardContainer<TCard>[],
    n: number,
    strategy?: DealStrategy,
  ): void {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`deal(n) requires a non-negative integer, got ${n}`);
    }
    if (targets.length === 0) {
      throw new RangeError("deal requires at least one target");
    }
    if (n === 0) return;

    const effective: DealStrategy =
      strategy ?? this.options?.config?.dealStrategy ?? "exhaust";

    switch (effective) {
      case "full-rounds": {
        const rounds = Math.min(n, Math.floor(this.drawPile.size / targets.length));
        if (rounds > 0) this.drawPile.deal(targets, rounds);
        return;
      }
      case "exhaust": {
        const cap = n * targets.length;
        let dealt = 0;
        while (dealt < cap && this.drawPile.size > 0) {
          const target = targets[dealt % targets.length] as CardContainer<TCard>;
          target.add(this.drawPile.takeFromEnd(1));
          dealt++;
        }
        return;
      }
      case "reshuffle": {
        const cap = n * targets.length;
        let dealt = 0;
        while (dealt < cap) {
          if (this.drawPile.size === 0) {
            if (this.discardPile.length === 0) {
              throw new RangeError(
                `Cannot deal ${cap} cards under "reshuffle": draw and discard piles are both empty after ${dealt}`,
              );
            }
            this.reshuffleDiscardIntoDeck();
          }
          const target = targets[dealt % targets.length] as CardContainer<TCard>;
          target.add(this.drawPile.takeFromEnd(1));
          dealt++;
        }
      }
    }
  }

  peek(n = 1): readonly TCard[] {
    return this.drawPile.peekFromEnd(n).slice().reverse();
  }

  discard(card: TCard | readonly TCard[]): void {
    if (Array.isArray(card)) {
      this.discardPile.push(...(card as TCard[]));
    } else {
      this.discardPile.push(card as TCard);
    }
  }

  /**
   * Add card(s) to the bottom of the draw pile (so they will not be the
   * next cards drawn). Use `discard()` to send cards to the discard pile.
   */
  add(card: TCard | readonly TCard[]): void {
    this.drawPile.addToStart(card);
  }

  /** True if any card in the draw pile matches. Does not search the discard pile. */
  contains(predicate: (card: TCard) => boolean): boolean {
    return this.drawPile.contains(predicate);
  }

  /** Remove the first matching card from the draw pile. Does not search the discard pile. */
  remove(predicate: (card: TCard) => boolean): TCard | undefined {
    return this.drawPile.remove(predicate);
  }

  reshuffleDiscardIntoDeck(): void {
    if (this.discardPile.length === 0) return;
    this.drawPile.replace(this.drawPile.snapshot().concat(this.discardPile));
    this.discardPile = [];
    this.drawPile.shuffle();
  }

  toJSON(): DeckSnapshot<TCard> {
    return {
      draw: this.drawPile.snapshot(),
      discard: this.discardPile.slice(),
    };
  }

  static fromJSON<T>(snapshot: DeckSnapshot<T>, rng: Rng): Deck<T> {
    const deck = new Deck<T>(snapshot.draw, rng);
    deck.discardPile = snapshot.discard.slice();
    return deck;
  }
}
