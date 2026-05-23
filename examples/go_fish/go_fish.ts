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
// Structure: the game's rules are a `moves: Move[]` catalog rather than
// hand-written `moveOffering` / `applyMove` switches. There are two
// player-moves (`ask`, `fish`) and three game-moves (`go-fish`,
// `commit-books`, `advance-turn`) that trigger each other to form the
// full turn flow.
//
// The example exports:
//   - `goFishGame`: a `Game<GoFishState, GoFishView>` you can pass to `runGame`.
//   - `playDemoGame`: a convenience wrapper that runs a 3-player game with
//     `randomBot` players and returns the final `GameRunResult`.

import {
    Deck,
    type Game,
    type GameMove,
    Hand,
    type Move,
    type Player,
    type PlayerId,
    type PlayerMove,
    type PlayerView,
    RANK_NAMES,
    type RankName,
    type StandardPlayingCard,
    type TriggeredMove,
    mulberry32,
    randomBot,
    rankFromName,
    runGame,
    standardPlayingDeck,
} from "../../src/index.js";

// --- Types --------------------------------------------------------------

type Rank = number; // 1..13 (Ace..King)

export interface GoFishState {
    readonly stock: Deck<StandardPlayingCard>;
    /**
     * The seated players in turn order. Each player has its hand attached
     * as `player.hand` (and every hand has `hand.player` set as the
     * reverse). The arrays index-align: `hands[i]` belongs to `players[i]`.
     */
    readonly players: readonly Player<GoFishView>[];
    readonly hands: readonly Hand<StandardPlayingCard>[];
    readonly books: Readonly<Record<PlayerId, readonly Rank[]>>;
    readonly turnIdx: number;
    readonly outPlayers: ReadonlySet<PlayerId>;
}

export interface GoFishView extends PlayerView {
    readonly viewer: PlayerId;
    readonly myHand: readonly StandardPlayingCard[];
    readonly opponentHandSizes: Readonly<Record<PlayerId, number>>;
    readonly stockSize: number;
    readonly books: Readonly<Record<PlayerId, readonly Rank[]>>;
    readonly order: readonly PlayerId[];
}

// --- Helpers ------------------------------------------------------------

const STARTING_HAND_SIZE: Readonly<Record<number, number>> = { 2: 7, 3: 7, 4: 5, 5: 5 };

function handFor(
    s: GoFishState,
    id: PlayerId,
): Hand<StandardPlayingCard> | undefined {
    return s.hands.find((h) => h.ownerId === id);
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
 * the input `books`. Returns the same `books` reference if nothing
 * changed, so callers can short-circuit cheaply.
 */
function commitBooksInHand(
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
 * Walk the seating order starting at `turnIdx + 1`. Skip players whose
 * hand and the stock are both empty (mark them as out). Returns the
 * index of the next playable player and the updated `outPlayers` set.
 */
function nextTurn(s: GoFishState): {
    readonly turnIdx: number;
    readonly outPlayers: ReadonlySet<PlayerId>;
} {
    let out = s.outPlayers;
    let idx = (s.turnIdx + 1) % s.players.length;
    for (let i = 0; i < s.players.length; i++) {
        const hand = s.hands[idx];
        if (!hand) return { turnIdx: idx, outPlayers: out };
        const id = hand.ownerId;
        if (out.has(id)) {
            idx = (idx + 1) % s.players.length;
            continue;
        }
        if (hand.size === 0 && s.stock.size === 0) {
            const newOut = new Set(out);
            newOut.add(id);
            out = newOut;
            idx = (idx + 1) % s.players.length;
            continue;
        }
        return { turnIdx: idx, outPlayers: out };
    }
    return { turnIdx: s.turnIdx, outPlayers: out };
}

// --- Moves --------------------------------------------------------------
//
// Trigger chains:
//   ask      → commit-books                  (catch from opponent)
//            → go-fish                       (miss)
//   fish     → commit-books                  (draw to replenish empty hand)
//            → advance-turn                  (stock empty edge case)
//   go-fish  → commit-books                  (drew a card)
//            → commit-books + advance-turn   (drew, didn't match rank)
//            → advance-turn                  (stock empty)

const askMove: PlayerMove<GoFishState> = {
    kind: "player",
    type: "ask",
    offer(s, playerId) {
        const hand = handFor(s, playerId);
        if (!hand || hand.size === 0) return null;
        const opponents = s.hands
            .filter((h) => h.ownerId !== playerId && h.size > 0)
            .map((h) => h.ownerId);
        if (opponents.length === 0) return null;
        return {
            label: "Ask another player for a rank",
            params: [
                { name: "target", kind: "named-options", options: opponents },
                {
                    name: "rank",
                    kind: "named-options",
                    options: hand
                        .valuesOf("rank")
                        .map((r) => RANK_NAMES[r - 1] as RankName)
                        // biome-ignore lint/style/noNonNullAssertion: names come from RANK_NAMES, so rankFromName always resolves
                        .sort((a, b) => rankFromName(a)! - rankFromName(b)!),
                },
            ],
        };
    },
    apply(s, params, ctx) {
        const askerId = ctx.actingPlayerId;
        const target = params.target as PlayerId;
        const rank = rankFromName(params.rank as string);
        if (rank === undefined) throw new Error(`Unknown rank name: ${params.rank}`);
        const asker = handFor(s, askerId);
        const targetHand = handFor(s, target);
        if (!asker) throw new Error(`No hand for asker "${askerId}"`);
        if (!targetHand) throw new Error(`No hand for target "${target}"`);

        const taken = takeAllOfRank(targetHand, rank);
        if (taken.length > 0) {
            // Catch — the asker keeps the turn. `commit-books` will fold
            // any 4-of-a-kind into their books pile.
            asker.add(taken);
            return { state: s, triggers: [{ type: "commit-books" }] };
        }
        // Miss — "go fish". The game-move decides whether the asker
        // keeps the turn (drew matching rank) or it passes.
        return {
            state: s,
            triggers: [{ type: "go-fish", params: { askedRank: rank } }],
        };
    },
};

const fishMove: PlayerMove<GoFishState> = {
    kind: "player",
    type: "fish",
    offer(s, playerId) {
        if (s.stock.size === 0) return null;
        const hand = handFor(s, playerId);
        const opponentsHaveCards = s.hands.some(
            (h) => h.ownerId !== playerId && h.size > 0,
        );
        // Only offered when `ask` is impossible: empty hand, or no
        // opponents holding any cards. Without this gate the player
        // could dodge an obligatory ask.
        if (hand && hand.size > 0 && opponentsHaveCards) return null;
        return { label: "Draw from stock", params: [] };
    },
    apply(s, _params, ctx) {
        const hand = handFor(s, ctx.actingPlayerId);
        if (!hand) throw new Error(`No hand for "${ctx.actingPlayerId}"`);
        if (s.stock.size === 0) {
            return { state: s, triggers: [{ type: "advance-turn" }] };
        }
        const [drawn] = s.stock.draw(1);
        if (!drawn) return { state: s, triggers: [{ type: "advance-turn" }] };
        hand.add(drawn);
        // Drawing because of an empty hand / no opponents is the *start*
        // of the turn, not its end — don't advance.
        return { state: s, triggers: [{ type: "commit-books" }] };
    },
};

const goFishMove: GameMove<GoFishState> = {
    kind: "game",
    type: "go-fish",
    apply(s, params, ctx) {
        const askerId = ctx.actingPlayerId;
        const askedRank = params.askedRank as Rank;
        const hand = handFor(s, askerId);
        if (!hand) throw new Error(`No hand for "${askerId}"`);
        if (s.stock.size === 0) {
            return { state: s, triggers: [{ type: "advance-turn" }] };
        }
        const [drawn] = s.stock.draw(1);
        if (!drawn) return { state: s, triggers: [{ type: "advance-turn" }] };
        hand.add(drawn);
        const triggers: TriggeredMove[] = [{ type: "commit-books" }];
        if (drawn.rankOf() !== askedRank) triggers.push({ type: "advance-turn" });
        return { state: s, triggers };
    },
};

const commitBooksMove: GameMove<GoFishState> = {
    kind: "game",
    type: "commit-books",
    apply(s, _params, ctx) {
        const hand = handFor(s, ctx.actingPlayerId);
        if (!hand) return { state: s };
        const next = commitBooksInHand(ctx.actingPlayerId, hand, s.books);
        return next === s.books ? { state: s } : { state: { ...s, books: next } };
    },
};

const advanceTurnMove: GameMove<GoFishState> = {
    kind: "game",
    type: "advance-turn",
    apply(s) {
        const { turnIdx, outPlayers } = nextTurn(s);
        return { state: { ...s, turnIdx, outPlayers } };
    },
};

// --- Game ---------------------------------------------------------------

export const goFishGame: Game<GoFishState, GoFishView> = {
    initialState(players, rng) {
        const n = players.length;
        const handSize = STARTING_HAND_SIZE[n];
        if (handSize === undefined) {
            throw new RangeError(`Go Fish supports 2–5 players, got ${n}`);
        }

        const stock = standardPlayingDeck(rng);
        stock.shuffle();

        // Build each player's hand and wire the cross-references in both
        // directions: hand.player → player, player.hand → hand.
        const hands: Hand<StandardPlayingCard>[] = [];
        for (const p of players) {
            const h = new Hand<StandardPlayingCard>(p.id, rng, [], {
                player: p,
                isPrivate: true,
            });
            p.hand = h;
            hands.push(h);
        }
        stock.deal(hands, handSize);

        let books: Readonly<Record<PlayerId, readonly Rank[]>> = {};
        for (const p of players) books = { ...books, [p.id]: [] };
        // The initial deal might already form books — commit those.
        for (const hand of hands) books = commitBooksInHand(hand.ownerId, hand, books);

        return {
            stock,
            players: players.slice(),
            hands,
            books,
            turnIdx: 0,
            outPlayers: new Set<PlayerId>(),
        };
    },

    moves: [
        askMove,
        fishMove,
        goFishMove,
        commitBooksMove,
        advanceTurnMove,
    ] satisfies Move<GoFishState>[],

    currentPlayer(s) {
        const hand = s.hands[s.turnIdx];
        if (!hand) throw new Error(`No hand at turn ${s.turnIdx}`);
        return hand.ownerId;
    },

    isTerminal(s) {
        // Standard end: all 13 books awarded.
        let totalBooks = 0;
        for (const ranks of Object.values(s.books)) totalBooks += ranks.length;
        if (totalBooks >= 13) return true;

        // Stuck-game end: stock empty AND no two players share any rank.
        // Without overlap, no asks can transfer cards and no new books
        // can form, so the game cannot make further progress.
        if (s.stock.size > 0) return false;
        const holdersByRank = new Map<Rank, number>();
        for (const hand of s.hands) {
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
        for (const p of s.players) {
            const n = (s.books[p.id] ?? []).length;
            scores[p.id] = n;
            if (n > topScore) {
                topScore = n;
                winners = [p.id];
            } else if (n === topScore) {
                winners.push(p.id);
            }
        }
        return { winners, scores };
    },

    viewFor(s, viewerId): GoFishView {
        const myHand = handFor(s, viewerId)?.reveal() ?? [];
        const opponentHandSizes: Record<PlayerId, number> = {};
        for (const h of s.hands) {
            if (h.ownerId !== viewerId) opponentHandSizes[h.ownerId] = h.size;
        }
        return {
            viewer: viewerId,
            myHand,
            opponentHandSizes,
            stockSize: s.stock.size,
            books: s.books,
            order: s.players.map((p) => p.id),
        };
    },
};

// --- Demo runner --------------------------------------------------------

/**
 * Run a single game with random bots. Returns the full `GameRunResult`,
 * whose `history` field captures every applied move (player + triggered
 * game moves) in order.
 */
export async function playDemoGame(
    seed = 42,
    playerIds: readonly PlayerId[] = ["alice", "bob", "carol"],
) {
    const rng = mulberry32(seed);
    const players = playerIds.map((id) => randomBot(id, rng.fork()));
    return runGame(goFishGame, players, rng);
}
