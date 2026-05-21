import { CardCollection } from "../card-container/card-collection.js";
import type { CardContainer } from "../card-container/card-container.js";
import type { AttrKey, AttrValue } from "../card/card.js";
import type { Rng } from "../rng/rng.js";

export interface DeckSnapshot<TCard> {
  readonly id: string;
  readonly draw: readonly TCard[];
  /** Id of the linked discard deck at snapshot time, if any. */
  readonly discardPileId?: string;
}

/**
 * Underflow handling for `Deck.deal`.
 *
 * - `"full-rounds"` — deal only complete rounds (`floor(size / targets.length)`),
 *   capped at the requested `n`. Leftovers remain in the deck.
 * - `"exhaust"` — deal round-robin until either `n` rounds are complete or
 *   the deck is empty. The final round may be partial.
 * - `"reshuffle"` — deal `n` full rounds, draining the linked discard deck
 *   back into this deck whenever the draw pile is exhausted. Throws
 *   `RangeError` if there is no discard deck, or if both piles run dry
 *   before `n` rounds complete.
 */
export type DealStrategy = "full-rounds" | "exhaust" | "reshuffle";

export interface DeckOptions<TCard = unknown> {
  /**
   * Stable identifier for this deck. Used to relink decks (e.g. a main
   * deck and its discard pile) after `toJSON` / `fromJSON`. Auto-generated
   * via `crypto.randomUUID()` when omitted.
   */
  readonly id?: string;
  /** Discard pile to link at construction. Equivalent to calling `setDiscardPile` immediately after. */
  readonly discardPile?: Deck<TCard>;
  /**
   * Optional shared config whose `dealStrategy` is the deck-level default
   * for `deal()`. Read fresh on each call, so mutating it between calls
   * (e.g. on a phase transition) is picked up immediately.
   */
  readonly config?: { dealStrategy?: DealStrategy };
}

export class Deck<TCard> implements CardContainer<TCard> {
  readonly id: string;
  private readonly drawPile: CardCollection<TCard>;
  private linkedDiscardPile: Deck<TCard> | undefined;
  private readonly options: DeckOptions<TCard> | undefined;

  constructor(cards: readonly TCard[], rng: Rng, options?: DeckOptions<TCard>) {
    this.drawPile = new CardCollection<TCard>(rng, cards);
    this.id = options?.id ?? crypto.randomUUID();
    this.linkedDiscardPile = options?.discardPile;
    this.options = options;
  }

  get size(): number {
    return this.drawPile.size;
  }

  /** The linked discard pile, if any. Returns the same `Deck` reference set via constructor or `setDiscardPile`. */
  get discardPile(): Deck<TCard> | undefined {
    return this.linkedDiscardPile;
  }

  /** Link a discard pile (or clear it by passing `undefined`). */
  setDiscardPile(deck: Deck<TCard> | undefined): void {
    this.linkedDiscardPile = deck;
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
  deal(targets: readonly CardContainer<TCard>[], n: number, strategy?: DealStrategy): void {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`deal(n) requires a non-negative integer, got ${n}`);
    }
    if (targets.length === 0) {
      throw new RangeError("deal requires at least one target");
    }
    if (n === 0) return;

    const effective: DealStrategy = strategy ?? this.options?.config?.dealStrategy ?? "exhaust";

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
            const discard = this.linkedDiscardPile;
            if (!discard || discard.size === 0) {
              throw new RangeError(
                `Cannot deal ${cap} cards under "reshuffle": draw pile is empty and discard pile is ${discard ? "also empty" : "not linked"} after ${dealt}`,
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

  /**
   * Add card(s) to the bottom of the draw pile (so they will not be the
   * next cards drawn). Use the linked discard pile's `add()` to send cards
   * there instead.
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

  /**
   * Group cards in the draw pile by the value of a named attribute and
   * return a `Map<value, count>`. Does not search the discard pile.
   * Cards missing the field (e.g. jokers when counting `"rank"`) are
   * skipped.
   */
  count<K extends AttrKey<TCard>>(field: K): Map<AttrValue<TCard, K>, number> {
    return this.drawPile.countByAttr(field) as Map<AttrValue<TCard, K>, number>;
  }

  /**
   * Distinct attribute values present in the draw pile, in first-seen
   * order. Does not search the discard pile. Cards missing the field
   * are skipped.
   */
  valuesOf<K extends AttrKey<TCard>>(field: K): AttrValue<TCard, K>[] {
    return this.drawPile.valuesOfAttr(field) as AttrValue<TCard, K>[];
  }

  /**
   * Drain the linked discard pile back into this deck and shuffle. If no
   * discard pile is linked, logs a warning and returns without mutating.
   * If the linked discard pile is empty, returns silently.
   */
  reshuffleDiscardIntoDeck(): void {
    const discard = this.linkedDiscardPile;
    if (!discard) {
      console.warn(
        `Deck "${this.id}" has no linked discard pile; reshuffleDiscardIntoDeck is a no-op.`,
      );
      return;
    }
    if (discard.size === 0) return;
    const cards = discard.tryDraw(discard.size);
    this.drawPile.replace(this.drawPile.snapshot().concat(cards));
    this.drawPile.shuffle();
  }

  toJSON(): DeckSnapshot<TCard> {
    const base = {
      id: this.id,
      draw: this.drawPile.snapshot(),
    };
    const discardId = this.linkedDiscardPile?.id;
    return discardId !== undefined ? { ...base, discardPileId: discardId } : base;
  }

  /**
   * Restore a deck from a snapshot. The `discardPileId` field is preserved
   * on the snapshot but the link is **not** re-established automatically —
   * callers must look up the matching deck and call `setDiscardPile`.
   */
  static fromJSON<T>(snapshot: DeckSnapshot<T>, rng: Rng): Deck<T> {
    return new Deck<T>(snapshot.draw, rng, { id: snapshot.id });
  }
}
