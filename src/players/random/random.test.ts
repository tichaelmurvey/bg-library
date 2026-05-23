import { describe, expect, it } from "vitest";
import type { MoveOffering, PlayerView } from "../../game/move.js";
import { mulberry32 } from "../../rng/mulberry32.js";
import { randomBot } from "./random.js";

const view = {} as PlayerView;

describe("randomBot", () => {
  it("picks one of the offered options", async () => {
    const bot = randomBot("a", mulberry32(1));
    const offering: MoveOffering = {
      options: [
        { type: "draw", params: [] },
        { type: "pass", params: [] },
      ],
    };
    const r = await bot.decide(view, offering);
    expect(["draw", "pass"]).toContain(r.type);
  });

  it("fills named-options params with a value from the option list", async () => {
    const bot = randomBot("a", mulberry32(1));
    const offering: MoveOffering = {
      options: [
        {
          type: "go",
          params: [{ name: "dir", kind: "named-options", options: ["n", "s", "e", "w"] }],
        },
      ],
    };
    for (let i = 0; i < 30; i++) {
      const r = await bot.decide(view, offering);
      expect(["n", "s", "e", "w"]).toContain(r.params.dir);
    }
  });

  it("fills number-range params with a value in range aligned to step", async () => {
    const bot = randomBot("a", mulberry32(1));
    const offering: MoveOffering = {
      options: [
        {
          type: "draw",
          params: [{ name: "n", kind: "number-range", min: 2, max: 10, step: 2 }],
        },
      ],
    };
    for (let i = 0; i < 30; i++) {
      const r = await bot.decide(view, offering);
      const v = r.params.n as number;
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(10);
      expect((v - 2) % 2).toBe(0);
    }
  });

  it("fills binary params with a boolean", async () => {
    const bot = randomBot("a", mulberry32(1));
    const offering: MoveOffering = {
      options: [{ type: "toggle", params: [{ name: "on", kind: "binary" }] }],
    };
    const r = await bot.decide(view, offering);
    expect(typeof r.params.on).toBe("boolean");
  });

  it("fills string params with the empty string", async () => {
    const bot = randomBot("a", mulberry32(1));
    const offering: MoveOffering = {
      options: [{ type: "name", params: [{ name: "label", kind: "string", maxLength: 10 }] }],
    };
    const r = await bot.decide(view, offering);
    expect(r.params.label).toBe("");
  });

  it("is deterministic for the same seed", async () => {
    const offering: MoveOffering = {
      options: [{ type: "x", params: [{ name: "n", kind: "number-range", min: 1, max: 100 }] }],
    };
    const a = randomBot("a", mulberry32(42));
    const b = randomBot("a", mulberry32(42));
    const seqA: unknown[] = [];
    const seqB: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      seqA.push((await a.decide(view, offering)).params.n);
      seqB.push((await b.decide(view, offering)).params.n);
    }
    expect(seqA).toEqual(seqB);
  });

  it("throws on an empty offering", async () => {
    const bot = randomBot("a", mulberry32(1));
    await expect(bot.decide(view, { options: [] })).rejects.toThrow();
  });
});
