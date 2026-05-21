// Go Fish, implemented on top of bg-library.
//
// Rules summary (see go_fish_rules.md for the full text):
//   - Standard 52-card pack. 2–3 players get 7 cards each, 4–5 get 5.
//   - On your turn, ask one opponent for a rank you already hold.
//   - If they have any cards of that rank, they hand them all over and you
//     go again. If not, "Go fish" — draw the top of the stock. If the
//     drawn card matches the rank you asked for, that's also a catch and
//     you continue. Otherwise the turn passes to your left.
//   - Four of a kind ("book") is laid down face-up. Whoever owns the most
//     books when all 13 are taken wins.
//   - If your hand is empty on your turn, draw from the stock first.
//   - If the stock is empty and your hand is empty, you're out.
//
// The example exports:
//   - `goFishGame`: a `Game<GoFishState, GoFishView>` you can pass to `runGame`.
//   - `randomBot`: a deterministic random-but-legal `Player<GoFishView>`.
//   - `playDemoGame`: a convenience wrapper that runs a 3-player game and
//     returns the final result.

import {
    Deck,
    type Game,
    Hand,
    type MoveOffering,
    type Player,
    type PlayerId,
    type PlayerView,
    RANK_NAMES,
    type RankName,
    type Rng,
    type StandardPlayingCard,
    mulberry32,
    rankFromName,
    runGame,
    standardPlayingDeck,
} from "../../src/index.js";

// --- Types --------------------------------------------------------------

type Rank = number; // 1..13 (Ace..King)

export interface GoFishState {
    readonly stock: Deck<StandardPlayingCard>;
    readonly hands: Readonly<Record<PlayerId, Hand<StandardPlayingCard>>>;
    readonly books: Readonly<Record<PlayerId, readonly Rank[]>>;
    readonly order: readonly PlayerId[];
    readonly turnIdx: number;
    readonly outPlayers: ReadonlySet<PlayerId>;
    readonly lastEvent?: GoFishEvent;
}

export type GoFishEvent =
    | {
        readonly type: "ask";
        readonly asker: PlayerId;
        readonly target: PlayerId;
        readonly rank: Rank;
        readonly transferred: number;
    }
    | {
        readonly type: "fish";
        readonly player: PlayerId;
        readonly rankAsked?: Rank;
        readonly drewMatching: boolean;
        readonly drewAnything: boolean;
    }
    | { readonly type: "book"; readonly player: PlayerId; readonly rank: Rank };

export interface GoFishView extends PlayerView {
    readonly viewer: PlayerId;
    readonly myHand: readonly StandardPlayingCard[];
    readonly opponentHandSizes: Readonly<Record<PlayerId, number>>;
    readonly stockSize: number;
    readonly books: Readonly<Record<PlayerId, readonly Rank[]>>;
    readonly order: readonly PlayerId[];
    readonly lastEvent?: GoFishEvent;
}

// --- Helpers ------------------------------------------------------------

const STARTING_HAND_SIZE: Readonly<Record<number, number>> = { 2: 7, 3: 7, 4: 5, 5: 5 };

function ranksInHand(hand: Hand<StandardPlayingCard>): Rank[] {
    return [...hand.count("rank").keys()].sort((a, b) => a - b);
}

function takeAllOfRank(
    hand: Hand<StandardPlayingCard>,
    rank: Rank,
): StandardPlayingCard[] {
    const taken: StandardPlayingCard[] = [];
    for (; ;) {
        const card = hand.remove((c) => c.rankOf() === rank);
        if (!card) break;
        taken.push(card);
    }
    return taken;
}

/**
 * Move any 4-of-a-kind from `hand` into `books[player]`, returning the
 * (possibly new) books record. Mutates the hand in place; never mutates
 * the input `books`.
 */
function commitBooks(
    player: PlayerId,
    hand: Hand<StandardPlayingCard>,
    books: Readonly<Record<PlayerId, readonly Rank[]>>,
): Readonly<Record<PlayerId, readonly Rank[]>> {
    let next = books;
    for (const [rank, count] of hand.count("rank")) {
        if (count >= 4) {
            takeAllOfRank(hand, rank);
            next = { ...next, [player]: [...(next[player] ?? []), rank] };
        }
    }
    return next;
}

/**
 * Walk the order starting at `from + 1`. Skip players whose hand and the
 * stock are both empty (mark them as out). Returns the index of the next
 * playable player and the updated `outPlayers` set.
 *
 * If every player is out, returns the original turn index — the loop's
 * terminal check should fire on the next call to `isTerminal`.
 */
function advanceTurn(s: GoFishState): {
    readonly turnIdx: number;
    readonly outPlayers: ReadonlySet<PlayerId>;
} {
    let out = s.outPlayers;
    let idx = (s.turnIdx + 1) % s.order.length;
    for (let i = 0; i < s.order.length; i++) {
        const id = s.order[idx] as PlayerId;
        if (out.has(id)) {
            idx = (idx + 1) % s.order.length;
            continue;
        }
        const hand = s.hands[id];
        if (hand && hand.size === 0 && s.stock.size === 0) {
            const newOut = new Set(out);
            newOut.add(id);
            out = newOut;
            idx = (idx + 1) % s.order.length;
            continue;
        }
        return { turnIdx: idx, outPlayers: out };
    }
    return { turnIdx: s.turnIdx, outPlayers: out };
}

// --- Game ---------------------------------------------------------------

export const goFishGame: Game<GoFishState, GoFishView> = {
    initialState(playerIds, rng) {
        const n = playerIds.length;
        const handSize = STARTING_HAND_SIZE[n];
        if (handSize === undefined) {
            throw new RangeError(`Go Fish supports 2–5 players, got ${n}`);
        }

        const stock = standardPlayingDeck(rng);
        stock.shuffle();

        const hands: Record<PlayerId, Hand<StandardPlayingCard>> = {};
        for (const id of playerIds) {
            hands[id] = new Hand<StandardPlayingCard>(id, rng);
        }
        stock.deal(Object.values(hands), handSize, "full-rounds");

        let books: Readonly<Record<PlayerId, readonly Rank[]>> = {};
        for (const id of playerIds) books = { ...books, [id]: [] };
        // Players might already hold a book from the initial deal — commit it.
        for (const id of playerIds) {
            const hand = hands[id];
            if (hand) books = commitBooks(id, hand, books);
        }

        return {
            stock,
            hands,
            books,
            order: playerIds.slice(),
            turnIdx: 0,
            outPlayers: new Set<PlayerId>(),
        };
    },

    currentPlayer(s) {
        return s.order[s.turnIdx] as PlayerId;
    },

    isTerminal(s) {
        // Standard end: all 13 books awarded.
        let totalBooks = 0;
        for (const ranks of Object.values(s.books)) totalBooks += ranks.length;
        if (totalBooks >= 13) return true;

        // Stuck-game end: stock empty AND no two players share any rank.
        // Without overlap, no asks can transfer cards and no new books can
        // form, so the game cannot make further progress.
        if (s.stock.size > 0) return false;
        const holdersByRank = new Map<Rank, number>();
        for (const id of s.order) {
            const hand = s.hands[id];
            if (!hand) continue;
            const ranks = new Set<Rank>();
            for (const card of hand.reveal()) {
                const r = card.rankOf();
                if (r !== undefined) ranks.add(r);
            }
            for (const r of ranks) holdersByRank.set(r, (holdersByRank.get(r) ?? 0) + 1);
        }
        for (const count of holdersByRank.values()) if (count >= 2) return false;
        return true;
    },

    result(s) {
        const scores: Record<PlayerId, number> = {};
        let topScore = -1;
        let winners: PlayerId[] = [];
        for (const id of s.order) {
            const n = (s.books[id] ?? []).length;
            scores[id] = n;
            if (n > topScore) {
                topScore = n;
                winners = [id];
            } else if (n === topScore) {
                winners.push(id);
            }
        }
        return { winners, scores };
    },

    moveOffering(s, playerId): MoveOffering {
        const hand = s.hands[playerId];
        const haveCards = hand && hand.size > 0;
        const opponentsWithCards = s.order.filter(
            (id) => id !== playerId && (s.hands[id]?.size ?? 0) > 0,
        );

        if (haveCards && opponentsWithCards.length > 0) {
            return {
                options: [
                    {
                        type: "ask",
                        label: "Ask another player for a rank",
                        params: [
                            {
                                name: "target",
                                kind: "named-options",
                                options: opponentsWithCards,
                            },
                            {
                                name: "rank",
                                kind: "named-options",
                                options: ranksInHand(hand).map((r) => RANK_NAMES[r - 1] as RankName),
                            },
                        ],
                    },
                ],
            };
        }

        // Otherwise the only thing the player can do is draw from the stock.
        // `currentPlayer` should already have skipped past out-of-game players,
        // so the stock having no cards here would be a degenerate state that
        // `isTerminal` should also have caught — but we keep the option to
        // avoid `runGame` throwing on an empty offering.
        return {
            options: [{ type: "fish", label: "Draw from stock", params: [] }],
        };
    },

    applyMove(s, move, playerId): GoFishState {
        const hand = s.hands[playerId];
        if (!hand) throw new Error(`No hand for player "${playerId}"`);

        let books = s.books;
        let event: GoFishEvent;
        let turnEnds = false;

        if (move.type === "ask") {
            const target = move.params.target as PlayerId;
            const rankName = move.params.rank as string;
            const rank = rankFromName(rankName);
            if (rank === undefined) throw new Error(`Unknown rank name: ${rankName}`);

            const targetHand = s.hands[target];
            if (!targetHand) throw new Error(`No hand for target "${target}"`);

            const taken = takeAllOfRank(targetHand, rank);
            if (taken.length > 0) {
                // Catch from another player — keep the turn.
                hand.add(taken);
                books = commitBooks(playerId, hand, books);
                event = { type: "ask", asker: playerId, target, rank, transferred: taken.length };
            } else if (s.stock.size > 0) {
                // Go fish — draw one from the stock.
                const [drawn] = s.stock.draw(1);
                if (drawn) {
                    hand.add(drawn);
                    const drawnRank = drawn.rankOf();
                    books = commitBooks(playerId, hand, books);
                    const drewMatching = drawnRank === rank;
                    event = {
                        type: "fish",
                        player: playerId,
                        rankAsked: rank,
                        drewMatching,
                        drewAnything: true,
                    };
                    if (!drewMatching) turnEnds = true;
                } else {
                    event = { type: "ask", asker: playerId, target, rank, transferred: 0 };
                    turnEnds = true;
                }
            } else {
                // No transfer and no stock left — turn ends.
                event = { type: "ask", asker: playerId, target, rank, transferred: 0 };
                turnEnds = true;
            }
        } else if (move.type === "fish") {
            // Drawing because hand was empty, or no opponent had any cards.
            if (s.stock.size > 0) {
                const [drawn] = s.stock.draw(1);
                if (drawn) {
                    hand.add(drawn);
                    books = commitBooks(playerId, hand, books);
                    event = { type: "fish", player: playerId, drewMatching: false, drewAnything: true };
                } else {
                    event = { type: "fish", player: playerId, drewMatching: false, drewAnything: false };
                    turnEnds = true;
                }
            } else {
                // Nothing to draw and nothing to ask — pass the turn.
                event = { type: "fish", player: playerId, drewMatching: false, drewAnything: false };
                turnEnds = true;
            }
        } else {
            throw new Error(`Unknown move type "${move.type}"`);
        }

        const base: GoFishState = { ...s, books, lastEvent: event };
        if (!turnEnds) return base;
        const { turnIdx, outPlayers } = advanceTurn(base);
        return { ...base, turnIdx, outPlayers };
    },

    viewFor(s, viewerId): GoFishView {
        const myHand = s.hands[viewerId]?.reveal() ?? [];
        const opponentHandSizes: Record<PlayerId, number> = {};
        for (const id of s.order) {
            if (id !== viewerId) opponentHandSizes[id] = s.hands[id]?.size ?? 0;
        }
        const base = {
            viewer: viewerId,
            myHand,
            opponentHandSizes,
            stockSize: s.stock.size,
            books: s.books,
            order: s.order,
        } satisfies Omit<GoFishView, "lastEvent">;
        return s.lastEvent !== undefined ? { ...base, lastEvent: s.lastEvent } : base;
    },
};

// --- A simple random-but-legal bot --------------------------------------

export function randomBot(id: PlayerId, rng: Rng): Player<GoFishView> {
    return {
        id,
        async decide(_view, offering) {
            const option = offering.options[rng.int(offering.options.length)];
            if (!option) throw new Error("empty offering");
            const params: Record<string, string | number | boolean> = {};
            for (const param of option.params) {
                switch (param.kind) {
                    case "named-options": {
                        const choice = param.options[rng.int(param.options.length)];
                        if (choice === undefined) throw new Error(`empty options for ${param.name}`);
                        params[param.name] = choice;
                        break;
                    }
                    case "number-range": {
                        const step = param.step ?? 1;
                        const steps = Math.floor((param.max - param.min) / step) + 1;
                        params[param.name] = param.min + rng.int(steps) * step;
                        break;
                    }
                    case "binary":
                        params[param.name] = rng.int(2) === 0;
                        break;
                    case "string":
                        params[param.name] = "";
                        break;
                }
            }
            return { type: option.type, params };
        },
    };
}

// --- Demo runner --------------------------------------------------------

/**
 * Run a single game with random bots. Returns the final `GameRunResult`
 * along with the list of events that occurred, useful for narration.
 */
export async function playDemoGame(
    seed = 42,
    playerIds: readonly PlayerId[] = ["alice", "bob", "carol"],
) {
    const rng = mulberry32(seed);
    const players = playerIds.map((id) => randomBot(id, rng.fork()));
    const events: GoFishEvent[] = [];
    // `onMoveApplied` fires once per player per move; tap only the first
    // player to capture each event exactly once.
    const tapped: Player<GoFishView>[] = players.map((p, i) =>
        i === 0
            ? {
                ...p,
                async onMoveApplied(view) {
                    if (view.lastEvent) events.push(view.lastEvent);
                },
            }
            : p,
    );
    const result = await runGame(goFishGame, tapped, rng);
    return { ...result, events };
}
