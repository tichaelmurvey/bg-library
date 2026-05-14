/**
 * The shared surface of any object that holds a collection of cards —
 * currently `Deck` and `Hand`. The interface covers the operations that
 * make sense uniformly across both: counting, adding, querying by
 * predicate, removing by predicate, and shuffling.
 *
 * Operations specific to one container (drawing, discarding, per-viewer
 * visibility) live on the concrete classes, not here.
 */
export interface CardContainer<TCard> {
  readonly size: number;
  add(card: TCard | readonly TCard[]): void;
  contains(predicate: (card: TCard) => boolean): boolean;
  /** Remove and return the first card matching the predicate, or undefined. */
  remove(predicate: (card: TCard) => boolean): TCard | undefined;
  /** Randomize internal order using the container's own `Rng`. */
  shuffle(): void;
}
