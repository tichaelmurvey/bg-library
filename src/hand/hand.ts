export type PlayerId = string;

export interface HandView<TCard> {
  readonly ownerId: PlayerId;
  readonly count: number;
  readonly cards: readonly TCard[] | undefined;
}

export class Hand<TCard> {
  private readonly cards: TCard[];

  constructor(
    readonly ownerId: PlayerId,
    initial: readonly TCard[] = [],
  ) {
    this.cards = initial.slice();
  }

  get size(): number {
    return this.cards.length;
  }

  add(card: TCard | readonly TCard[]): void {
    if (Array.isArray(card)) {
      this.cards.push(...(card as TCard[]));
    } else {
      this.cards.push(card as TCard);
    }
  }

  remove(predicate: (c: TCard) => boolean): TCard | undefined {
    const idx = this.cards.findIndex(predicate);
    if (idx === -1) return undefined;
    return this.cards.splice(idx, 1)[0];
  }

  viewFor(viewerId: PlayerId): HandView<TCard> {
    const isOwner = viewerId === this.ownerId;
    return {
      ownerId: this.ownerId,
      count: this.cards.length,
      cards: isOwner ? this.cards.slice() : undefined,
    };
  }

  reveal(): readonly TCard[] {
    return this.cards.slice();
  }
}
