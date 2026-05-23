import { CardCollection } from "../card-container/card-collection.js";
import type { CardContainer } from "../card-container/card-container.js";
import type { AttrKey, AttrValue } from "../card/card.js";
import type { PlayerView } from "../game/move.js";
import type { Player } from "../game/player.js";
import type { Rng } from "../rng/rng.js";

export type PlayerId = string;

export interface HandView<TCard> {
  readonly ownerId: PlayerId;
  readonly count: number;
  readonly cards: readonly TCard[] | undefined;
}

/** Construction-time options for a `Hand`. */
export interface HandOptions {
  /** Owning player, if known at construction. Also settable via `hand.player = ...`. */
  readonly player?: Player<PlayerView>;
  /**
   * If `true` (default), only the owning player sees the cards via
   * `viewFor`; other viewers see only the count. If `false`, all viewers
   * see the cards.
   */
  readonly isPrivate?: boolean;
}

export class Hand<TCard> implements CardContainer<TCard> {
  private readonly cards: CardCollection<TCard>;
  /**
   * Owning player reference. Mutable so the game's `initialState` can
   * wire up cross-links (`hand.player = p; p.hand = hand;`) after both
   * sides exist.
   */
  player: Player<PlayerView> | undefined;
  /** True if non-owners see only the card count via `viewFor`. */
  readonly isPrivate: boolean;

  constructor(
    readonly ownerId: PlayerId,
    rng: Rng,
    initial: readonly TCard[] = [],
    options: HandOptions = {},
  ) {
    this.cards = new CardCollection<TCard>(rng, initial);
    this.player = options.player;
    this.isPrivate = options.isPrivate ?? true;
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
    const visible = !this.isPrivate || viewerId === this.ownerId;
    return {
      ownerId: this.ownerId,
      count: this.cards.size,
      cards: visible ? this.cards.snapshot() : undefined,
    };
  }

  reveal(): readonly TCard[] {
    return this.cards.snapshot();
  }
}
