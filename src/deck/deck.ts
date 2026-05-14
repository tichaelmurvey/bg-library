import type { Rng } from "../rng/rng.js";

export interface DeckSnapshot<TCard> {
  readonly draw: readonly TCard[];
  readonly discard: readonly TCard[];
}

export class Deck<TCard> {
  private drawPile: TCard[];
  private discardPile: TCard[] = [];
  private readonly rng: Rng;

  constructor(cards: readonly TCard[], rng: Rng) {
    this.drawPile = cards.slice();
    this.rng = rng;
  }

  get size(): number {
    return this.drawPile.length;
  }

  get discardSize(): number {
    return this.discardPile.length;
  }

  shuffle(): void {
    this.drawPile = this.rng.shuffle(this.drawPile);
  }

  draw(n = 1): TCard[] {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`draw(n) requires a non-negative integer, got ${n}`);
    }
    if (n > this.drawPile.length) {
      throw new RangeError(
        `Cannot draw ${n} cards: only ${this.drawPile.length} remain in deck`,
      );
    }
    return this.drawPile.splice(this.drawPile.length - n, n).reverse();
  }

  tryDraw(n: number): TCard[] {
    const available = Math.min(n, this.drawPile.length);
    return this.draw(available);
  }

  peek(n = 1): readonly TCard[] {
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`peek(n) requires a non-negative integer, got ${n}`);
    }
    const take = Math.min(n, this.drawPile.length);
    const start = this.drawPile.length - take;
    return this.drawPile.slice(start).reverse();
  }

  discard(card: TCard | readonly TCard[]): void {
    if (Array.isArray(card)) {
      this.discardPile.push(...(card as TCard[]));
    } else {
      this.discardPile.push(card as TCard);
    }
  }

  reshuffleDiscardIntoDeck(): void {
    if (this.discardPile.length === 0) return;
    this.drawPile = this.rng.shuffle(this.drawPile.concat(this.discardPile));
    this.discardPile = [];
  }

  toJSON(): DeckSnapshot<TCard> {
    return {
      draw: this.drawPile.slice(),
      discard: this.discardPile.slice(),
    };
  }

  static fromJSON<T>(snapshot: DeckSnapshot<T>, rng: Rng): Deck<T> {
    const deck = new Deck<T>(snapshot.draw, rng);
    deck.discardPile = snapshot.discard.slice();
    return deck;
  }
}
