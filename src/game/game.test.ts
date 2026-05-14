import { describe, expect, it } from "vitest";
import { Deck } from "../deck/deck.js";
import type { PlayerId } from "../hand/hand.js";
import { mulberry32 } from "../rng/mulberry32.js";
import type { Rng } from "../rng/rng.js";
import type { Game } from "./game.js";
import { IllegalMoveError, runGame } from "./loop.js";
import type { Move, PlayerView } from "./move.js";
import type { Player } from "./player.js";

// --- Minimal "high-card draw" game --------------------------------------
// Each turn the current player draws the top card. After every player has
// drawn once, whoever drew the highest card wins.

interface HCState {
  readonly deck: Deck<number>;
  readonly drawn: Readonly<Record<PlayerId, number | undefined>>;
  readonly order: readonly PlayerId[];
  readonly turn: number;
}

interface HCView extends PlayerView {
  readonly myDraw: number | undefined;
  readonly remainingPlayers: number;
  readonly viewer: PlayerId;
}

interface HCMove extends Move {
  readonly type: "draw";
}

const highCard: Game<HCState, HCView, HCMove> = {
  initialState(playerIds, rng: Rng) {
    const cards = Array.from({ length: 20 }, (_, i) => i + 1);
    const deck = new Deck<number>(cards, rng);
    deck.shuffle();
    const drawn: Record<PlayerId, number | undefined> = {};
    for (const id of playerIds) drawn[id] = undefined;
    return { deck, drawn, order: playerIds.slice(), turn: 0 };
  },
  currentPlayer(state) {
    return state.order[state.turn] as PlayerId;
  },
  isTerminal(state) {
    return state.turn >= state.order.length;
  },
  result(state) {
    let bestCard = -Infinity;
    let winners: PlayerId[] = [];
    const scores: Record<PlayerId, number> = {};
    for (const id of state.order) {
      const v = state.drawn[id] ?? -1;
      scores[id] = v;
      if (v > bestCard) {
        bestCard = v;
        winners = [id];
      } else if (v === bestCard) {
        winners.push(id);
      }
    }
    return { winners, scores };
  },
  legalMoves() {
    return [{ type: "draw" } as const];
  },
  applyMove(state, _move, playerId) {
    const [card] = state.deck.draw(1);
    return {
      ...state,
      drawn: { ...state.drawn, [playerId]: card },
      turn: state.turn + 1,
    };
  },
  viewFor(state, viewerId) {
    return {
      myDraw: state.drawn[viewerId],
      remainingPlayers: state.order.length - state.turn,
      viewer: viewerId,
    };
  },
};

const scriptedPlayer = (id: PlayerId): Player<HCView, HCMove> => ({
  id,
  async decide(_view, legal) {
    return legal[0] as HCMove;
  },
});

describe("runGame (end-to-end smoke)", () => {
  it("plays high-card to completion and produces a result", async () => {
    const players = [scriptedPlayer("alice"), scriptedPlayer("bob")];
    const { result, history } = await runGame(highCard, players, mulberry32(1));
    expect(history).toHaveLength(2);
    expect(result.winners.length).toBeGreaterThanOrEqual(1);
    expect(result.scores).toBeDefined();
  });

  it("is deterministic for the same RNG seed", async () => {
    const run = () =>
      runGame(highCard, [scriptedPlayer("alice"), scriptedPlayer("bob")], mulberry32(1234));
    const a = await run();
    const b = await run();
    expect(a.result.winners).toEqual(b.result.winners);
    expect(a.result.scores).toEqual(b.result.scores);
  });

  it("invokes lifecycle hooks on each player", async () => {
    const calls: string[] = [];
    const tracking = (id: PlayerId): Player<HCView, HCMove> => ({
      id,
      async decide(_view, legal) {
        calls.push(`${id}:decide`);
        return legal[0] as HCMove;
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
    await runGame(highCard, [tracking("alice"), tracking("bob")], mulberry32(1));
    expect(calls[0]).toBe("alice:start");
    expect(calls[1]).toBe("bob:start");
    expect(calls.at(-1)).toBe("bob:end");
    expect(calls).toContain("alice:applied(alice)");
    expect(calls).toContain("bob:applied(alice)");
  });

  it("rejects illegal moves from a player", async () => {
    const cheater: Player<HCView, HCMove> = {
      id: "cheater",
      async decide() {
        return { type: "fly-to-the-moon" } as unknown as HCMove;
      },
    };
    await expect(
      runGame(highCard, [cheater, scriptedPlayer("bob")], mulberry32(1)),
    ).rejects.toBeInstanceOf(IllegalMoveError);
  });
});
