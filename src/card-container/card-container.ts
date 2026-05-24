import type { AttrKey, AttrValue } from "../card/card.js";

/**
 * The shared surface of any object that holds a collection of cards —
 * currently `Deck` and `Hand`. The interface covers the operations that
 * make sense uniformly across both: counting, adding, querying by
 * predicate, moving between containers, and shuffling.
 *
 * Cards are persistent and cannot be destroyed — the `move` method
 * requires a destination container.
 *
 * Operations specific to one container (drawing, discarding, per-viewer
 * visibility) live on the concrete classes, not here.
 */
export interface CardContainer<TCard> {
  readonly size: number;
  add(card: TCard | readonly TCard[]): void;
  contains(predicate: (card: TCard) => boolean): boolean;
  /**
   * Find the first card matching the predicate, remove it from this
   * container, and add it to `destination`. Returns the moved card, or
   * `undefined` if no card matched.
   */
  move(predicate: (card: TCard) => boolean, destination: CardContainer<TCard>): TCard | undefined;
  /** Randomize internal order using the container's own `Rng`. */
  shuffle(): void;
  /**
   * Group held cards by the value of a named attribute and return the
   * resulting `Map<value, count>`. Cards that don't carry the field
   * (e.g. jokers when counting `"rank"`) are skipped.
   *
   * The field name and the map's key type are derived from `TCard` via
   * `AttrKey` / `AttrValue` — so on a `Deck<number>` this method is
   * unreachable at the call site (no valid field), while on a deck of
   * `StandardPlayingCard` it offers `"rank" | "suit" | "joker"`.
   */
  count<K extends AttrKey<TCard>>(field: K): Map<AttrValue<TCard, K>, number>;
  /**
   * Distinct values present in the container for the given attribute,
   * in first-seen iteration order. Cards missing the field are skipped.
   *
   * `valuesOf(field)` is equivalent to `[...count(field).keys()]` but
   * skips the intermediate `Map`.
   */
  valuesOf<K extends AttrKey<TCard>>(field: K): AttrValue<TCard, K>[];
}
