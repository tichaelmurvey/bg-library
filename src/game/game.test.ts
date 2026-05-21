import { describe, expect, it } from "vitest";
import { Deck } from "../deck/deck.js";
import type { PlayerId } from "../hand/hand.js";
import { mulberry32 } from "../rng/mulberry32.js";
import type { Rng } from "../rng/rng.js";
import type { Game } from "./game.js";
import { IllegalMoveError, runGame } from "./loop.js";
import type { MoveOffering, MoveResponse, PlayerView } from "./move.js";
import type { Player } from "./player.js";

// --- Minimal "draw N cards then pass" game ------------------------------
// Demonstrates: option choice (draw vs. pass) + a number-range param.
// On each turn the player chooses to either draw 1..3 cards or pass.
// After every player has taken one turn, whoever holds the highest card
// wins. Pass ⇒ no cards drawn ⇒ score 0.

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

const game: Game<State, View> = {
  initialState(playerIds, rng: Rng) {
    const deck = new Deck<number>(
      Array.from({ length: 30 }, (_, i) => i + 1),
      rng,
    );
    deck.shuffle();
    const best: Record<PlayerId, number> = {};
    for (const id of playerIds) best[id] = 0;
    return { deck, best, order: playerIds.slice(), turn: 0 };
  },
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
  moveOffering(s, _playerId): MoveOffering {
    const max = Math.min(3, s.deck.size);
    return {
      options: [
        {
          type: "draw",
          label: "Draw cards",
          params: [{ name: "n", kind: "number-range", min: 1, max: Math.max(1, max) }],
        },
        { type: "pass", label: "Pass", params: [] },
      ],
    };
  },
  applyMove(s, move, playerId) {
    if (move.type === "pass") {
      return { ...s, turn: s.turn + 1 };
    }
    const n = move.params.n as number;
    const drawn = s.deck.draw(n);
    const localBest = Math.max(...drawn);
    const prev = s.best[playerId] ?? 0;
    return {
      ...s,
      best: { ...s.best, [playerId]: Math.max(prev, localBest) },
      turn: s.turn + 1,
    };
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

describe("runGame with MoveOffering / MoveResponse", () => {
  it("plays a full game to completion", async () => {
    const { result, history } = await runGame(
      game,
      [drawer("alice", 3), drawer("bob", 1)],
      mulberry32(1),
    );
    expect(history).toHaveLength(2);
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

  it("invokes lifecycle hooks", async () => {
    const calls: string[] = [];
    const tracker = (id: PlayerId): Player<View> => ({
      id,
      async decide() {
        calls.push(`${id}:decide`);
        return { type: "pass", params: {} };
      },
      onGameStart() {
        calls.push(`${id}:start`);
      },
      onMoveApplied(_v, _m, by) {
        calls.push(`${id}:applied(${by})`);
      },
      onGameEnd() {
        calls.push(`${id}:end`);
      },
    });
    await runGame(game, [tracker("alice"), tracker("bob")], mulberry32(1));
    expect(calls[0]).toBe("alice:start");
    expect(calls.at(-1)).toBe("bob:end");
    expect(calls).toContain("alice:applied(alice)");
    expect(calls).toContain("bob:applied(alice)");
  });
});
