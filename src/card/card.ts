/**
 * A typed, introspectable model for cards.
 *
 * `Card<TAttrs>` is `{ name, attrs }` — only `name` is library-required.
 * Everything else lives in `attrs`, a keyed record of `CardAttribute`s.
 * Each attribute is a discriminated-union value that carries enough type
 * information to be displayed, compared, or validated without external
 * schema. This mirrors the `MoveParam` system in `src/game/move.ts`.
 *
 * Two attribute kinds ship in v1: `integer` and `discrete`. New kinds can
 * be added as concrete consumers demand them (e.g. an `effect` kind for
 * card games with playable abilities).
 */

export type AttributeKind = "integer" | "discrete";

/**
 * A whole-number attribute (rank, cost, power, etc.). `min`/`max` are
 * optional bounds that downstream code can use for validation or UI.
 */
export interface IntegerAttribute {
  readonly kind: "integer";
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
}

/**
 * A pick-one-of attribute. `value` must be a member of `options`. The
 * `T` parameter narrows the value to a literal union when the options
 * are known at compile time.
 */
export interface DiscreteAttribute<T extends string = string> {
  readonly kind: "discrete";
  readonly value: T;
  readonly options: readonly T[];
}

export type CardAttribute = IntegerAttribute | DiscreteAttribute;

/** A keyed record of attributes. Keys are the attribute names. */
export type CardAttrs = Readonly<Record<string, CardAttribute>>;

/**
 * A card with a display name and an `attrs` bag whose shape is set by
 * the concrete card type. Iterate with `Object.entries(card.attrs)`.
 */
export interface Card<TAttrs extends CardAttrs = CardAttrs> {
  readonly name: string;
  readonly attrs: TAttrs;
}

/**
 * The union of attribute names available on cards of type `TCard`.
 * Distributes over unions, so for a discriminated card union it yields
 * every key that appears on at least one branch.
 *
 * For non-`Card` element types (e.g. `Deck<number>`), this is `never` —
 * which makes attribute-keyed methods like `CardContainer.count`
 * unreachable at the call site.
 */
export type AttrKey<TCard> = TCard extends Card<infer A> ? Extract<keyof A, string> : never;

/**
 * The `value` type for a specific attribute name on cards of type
 * `TCard`. Distributes over unions: branches that don't carry the key
 * contribute `never`, so the resulting union is the union of value
 * types actually produced by that key.
 */
export type AttrValue<TCard, K extends string> = TCard extends Card<infer A>
  ? K extends keyof A
    ? A[K] extends { readonly value: infer V }
      ? V
      : never
    : never
  : never;
