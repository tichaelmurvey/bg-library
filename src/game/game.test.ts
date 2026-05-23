import { describe, expect, it } from "vitest";
import { Deck } from "../deck/deck.js";
import type { PlayerId } from "../hand/hand.js";
import { mulberry32 } from "../rng/mulberry32.js";
import type { Rng } from "../rng/rng.js";
import type { Game } from "./game.js";
import { IllegalMoveError, runGame } from "./loop.js";
import type { GameMove, Move, PlayerMove, PlayerView } from "./move.js";
import type { Player } from "./player.js";

// --- Minimal "draw N cards then pass" game ------------------------------
// Demonstrates: two player moves (`draw`, `pass`), a `record-score` game
// move triggered by `draw` to fold the result back into state, and the
// new `Game.moves` shape. After every player has taken one turn,
// whoever holds the highest card wins. Pass ⇒ no cards drawn ⇒ score 0.

interface State {
  readonly deck: Deck<number>;
  readonly best: Readonly<Record<PlayerId, number>>;
  readonly order: readonly PlayerId[];
  readonly turn: number;
}

interface View extends PlayerView {
  readonly viewer: PlayerId;
  readonly best: Readonly<Record<PlayerId, number>>;
  readonly cardsLeft: number;
}

const drawMove: PlayerMove<State> = {
  kind: "player",
  type: "draw",
  offer(s) {
    if (s.deck.size === 0) return null;
    const max = Math.min(3, s.deck.size);
    return {
      label: "Draw cards",
      params: [{ name: "n", kind: "number-range", min: 1, max: Math.max(1, max) }],
    };
  },
  apply(s, params, ctx) {
    const n = params.n as number;
    const drawn = s.deck.draw(n);
    const localBest = Math.max(...drawn);
    return {
      state: { ...s, turn: s.turn + 1 },
      triggers: [
        { type: "record-score", params: { playerId: ctx.actingPlayerId, score: localBest } },
      ],
    };
  },
};

const passMove: PlayerMove<State> = {
  kind: "player",
  type: "pass",
  offer() {
    return { label: "Pass", params: [] };
  },
  apply(s) {
    return { state: { ...s, turn: s.turn + 1 } };
  },
};

const recordScoreMove: GameMove<State> = {
  kind: "game",
  type: "record-score",
  apply(s, params) {
    const playerId = params.playerId as PlayerId;
    const score = params.score as number;
    const prev = s.best[playerId] ?? 0;
    return {
      state: { ...s, best: { ...s.best, [playerId]: Math.max(prev, score) } },
    };
  },
};

const game: Game<State, View> = {
  initialState(players, rng: Rng) {
    const deck = new Deck<number>(
      Array.from({ length: 30 }, (_, i) => i + 1),
      rng,
    );
    deck.shuffle();
    const best: Record<PlayerId, number> = {};
    for (const p of players) best[p.id] = 0;
    return { deck, best, order: players.map((p) => p.id), turn: 0 };
  },
  moves: [drawMove, passMove, recordScoreMove] satisfies Move<State>[],
  currentPlayer(s) {
    return s.order[s.turn] as PlayerId;
  },
  isTerminal(s) {
    return s.turn >= s.order.length;
  },
  result(s) {
    const scores = { ...s.best };
    let top = Number.NEGATIVE_INFINITY;
    let winners: PlayerId[] = [];
    for (const id of s.order) {
      const v = scores[id] ?? 0;
      if (v > top) {
        top = v;
        winners = [id];
      } else if (v === top) {
        winners.push(id);
      }
    }
    return { winners, scores };
  },
  viewFor(s, viewerId) {
    return { viewer: viewerId, best: { ...s.best }, cardsLeft: s.deck.size };
  },
};

const drawer = (id: PlayerId, n: number): Player<View> => ({
  id,
  async decide(_view, offering) {
    const draw = offering.options.find((o) => o.type === "draw");
    if (!draw) return { type: "pass", params: {} };
    return { type: "draw", params: { n } };
  },
});

const passer = (id: PlayerId): Player<View> => ({
  id,
  async decide() {
    return { type: "pass", params: {} };
  },
});

describe("runGame with Move catalog", () => {
  it("plays a full game to completion", async () => {
    const { result, history } = await runGame(
      game,
      [drawer("alice", 3), drawer("bob", 1)],
      mulberry32(1),
    );
    // 2 player moves + 2 triggered `record-score` moves
    expect(history).toHaveLength(4);
    expect(history.filter((m) => m.triggeredBy === undefined)).toHaveLength(2);
    expect(history.filter((m) => m.triggeredBy === "draw")).toHaveLength(2);
    expect(result.winners.length).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic for the same seed", async () => {
    const run = () => runGame(game, [drawer("alice", 2), drawer("bob", 2)], mulberry32(1234));
    const a = await run();
    const b = await run();
    expect(a.result.winners).toEqual(b.result.winners);
    expect(a.result.scores).toEqual(b.result.scores);
  });

  it("supports a paramless move", async () => {
    const { result } = await runGame(game, [passer("alice"), passer("bob")], mulberry32(7));
    expect(result.scores?.alice).toBe(0);
    expect(result.scores?.bob).toBe(0);
  });

  it("rejects an unknown move type", async () => {
    const cheater: Player<View> = {
      id: "cheater",
      async decide() {
        return { type: "fly", params: {} };
      },
    };
    await expect(runGame(game, [cheater, passer("bob")], mulberry32(1))).rejects.toBeInstanceOf(
      IllegalMoveError,
    );
  });

  it("rejects an out-of-range param value", async () => {
    const tooMany: Player<View> = {
      id: "greedy",
      async decide() {
        return { type: "draw", params: { n: 99 } };
      },
    };
    await expect(runGame(game, [tooMany, passer("bob")], mulberry32(1))).rejects.toBeInstanceOf(
      IllegalMoveError,
    );
  });

  it("invokes lifecycle hooks and fires onMoveApplied for triggered moves too", async () => {
    const calls: string[] = [];
    const tracker = (id: PlayerId): Player<View> => ({
      id,
      async decide() {
        calls.push(`${id}:decide`);
        return { type: "draw", params: { n: 1 } };
      },
      onGameStart() {
        calls.push(`${id}:start`);
      },
      onMoveApplied(_v, applied) {
        const tag = applied.triggeredBy ? `triggered:${applied.type}` : applied.type;
        calls.push(`${id}:applied(${tag} by ${applied.playerId})`);
      },
      onGameEnd() {
        calls.push(`${id}:end`);
      },
    });
    await runGame(game, [tracker("alice"), tracker("bob")], mulberry32(1));
    expect(calls[0]).toBe("alice:start");
    expect(calls.at(-1)).toBe("bob:end");
    // Both the player's `draw` and the triggered `record-score` fire.
    expect(calls).toContain("alice:applied(draw by alice)");
    expect(calls).toContain("alice:applied(triggered:record-score by alice)");
    expect(calls).toContain("bob:applied(draw by alice)");
    expect(calls).toContain("bob:applied(triggered:record-score by alice)");
  });
});
