import type { Rng } from "../rng/rng.js";
import type { CardContainer } from "./card-container.js";

/**
 * A shuffleable, mutable collection of cards backed by an `Rng`.
 *
 * Used by `Deck` and `Hand` internally so the shared mechanics —
 * counting, predicate-based search and removal, shuffling, peeking from
 * an end — live in one place. Position-explicit by design: callers
 * choose `addToEnd` vs `addToStart`, rather than the collection picking
 * a default. The domain classes (Deck, Hand) translate that choice into
 * their own `add()` semantics.
 *
 * This class does not implement `CardContainer` because it intentionally
 * has no opinion about which end `add` should target.
 */
export class CardCollection<TCard> {
  private items: TCard[];
  private readonly rng: Rng;

  constructor(rng: Rng, initial: readonly TCard[] = []) {
    this.rng = rng;
    this.items = initial.slice();
  }

  get size(): number {
    return this.items.length;
  }

  /** Defensive copy of all items in their underlying order. */
  snapshot(): TCard[] {
    return this.items.slice();
  }

  addToEnd(card: TCard | readonly TCard[]): void {
    if (Array.isArray(card)) {
      this.items.push(...(card as TCard[]));
    } else {
      this.items.push(card as TCard);
    }
  }

  addToStart(card: TCard | readonly TCard[]): void {
    if (Array.isArray(card)) {
      this.items.unshift(...(card as TCard[]));
    } else {
      this.items.unshift(card as TCard);
    }
  }

  contains(predicate: (card: TCard) => boolean): boolean {
    return this.items.some(predicate);
  }

  /** Remove and return the first matching card, or undefined. */
  remove(predicate: (card: TCard) => boolean): TCard | undefined {
    const idx = this.items.findIndex(predicate);
    if (idx === -1) return undefined;
    return this.items.splice(idx, 1)[0];
  }

  /** Randomize order using the collection's own `Rng`. */
  shuffle(): void {
    this.items = this.rng.shuffle(this.items);
  }

  /**
   * Non-mutating look at the last `n` items in their underlying order.
   * Returns up to `size` items if `n` exceeds the collection's length.
   */
  peekFromEnd(n: number): readonly TCard[] {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`peekFromEnd(n) requires a non-negative integer, got ${n}`);
    }
    const take = Math.min(n, this.items.length);
    return this.items.slice(this.items.length - take);
  }

  /**
   * Remove and return the last `n` items in their underlying order.
   * Throws `RangeError` if `n` exceeds the collection's length.
   */
  takeFromEnd(n: number): TCard[] {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`takeFromEnd(n) requires a non-negative integer, got ${n}`);
    }
    if (n > this.items.length) {
      throw new RangeError(
        `Cannot take ${n} items: only ${this.items.length} present`,
      );
    }
    return this.items.splice(this.items.length - n, n);
  }

  /** Replace all items wholesale. */
  replace(items: readonly TCard[]): void {
    this.items = items.slice();
  }

  /**
   * Deal `n` cards to each of the given containers, round-robin from the
   * end of this collection (the "top"). Each container receives `n`
   * cards via its own `add()` method.
   *
   * Throws `RangeError` if `n` is negative or non-integer, if `containers`
   * is empty, or if there are fewer than `n * containers.length` cards
   * available.
   */
  deal(containers: readonly CardContainer<TCard>[], n: number): void {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`deal(n) requires a non-negative integer, got ${n}`);
    }
    if (containers.length === 0) {
      throw new RangeError("deal requires at least one container");
    }
    const total = n * containers.length;
    if (total > this.items.length) {
      throw new RangeError(
        `Cannot deal ${total} cards (${n} × ${containers.length}): only ${this.items.length} present`,
      );
    }
    for (let round = 0; round < n; round++) {
      for (const container of containers) {
        const card = this.items.pop() as TCard;
        container.add(card);
      }
    }
  }
}
