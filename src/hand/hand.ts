import { CardCollection } from "../card-container/card-collection.js";
import type { CardContainer } from "../card-container/card-container.js";
import type { AttrKey, AttrValue } from "../card/card.js";
import type { Rng } from "../rng/rng.js";

export type PlayerId = string;

export interface HandView<TCard> {
  readonly ownerId: PlayerId;
  readonly count: number;
  readonly cards: readonly TCard[] | undefined;
}

export class Hand<TCard> implements CardContainer<TCard> {
  private readonly cards: CardCollection<TCard>;

  constructor(
    readonly ownerId: PlayerId,
    rng: Rng,
    initial: readonly TCard[] = [],
  ) {
    this.cards = new CardCollection<TCard>(rng, initial);
  }

  get size(): number {
    return this.cards.size;
  }

  add(card: TCard | readonly TCard[]): void {
    this.cards.addToEnd(card);
  }

  contains(predicate: (card: TCard) => boolean): boolean {
    return this.cards.contains(predicate);
  }

  remove(predicate: (card: TCard) => boolean): TCard | undefined {
    return this.cards.remove(predicate);
  }

  shuffle(): void {
    this.cards.shuffle();
  }

  /**
   * Group held cards by the value of a named attribute and return a
   * `Map<value, count>`. Cards missing the field are skipped.
   */
  count<K extends AttrKey<TCard>>(field: K): Map<AttrValue<TCard, K>, number> {
    return this.cards.countByAttr(field) as Map<AttrValue<TCard, K>, number>;
  }

  /**
   * Distinct attribute values present in the hand, in first-seen order.
   * Cards missing the field are skipped.
   */
  valuesOf<K extends AttrKey<TCard>>(field: K): AttrValue<TCard, K>[] {
    return this.cards.valuesOfAttr(field) as AttrValue<TCard, K>[];
  }

  viewFor(viewerId: PlayerId): HandView<TCard> {
    const isOwner = viewerId === this.ownerId;
    return {
      ownerId: this.ownerId,
      count: this.cards.size,
      cards: isOwner ? this.cards.snapshot() : undefined,
    };
  }

  reveal(): readonly TCard[] {
    return this.cards.snapshot();
  }
}
