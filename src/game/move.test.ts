import { describe, expect, it } from "vitest";
import type { MoveOffering, MoveResponse } from "./move.js";
import { validateMoveResponse } from "./move.js";

const offering: MoveOffering = {
  options: [
    {
      type: "move",
      params: [
        { name: "dir", kind: "binary", trueLabel: "forward", falseLabel: "back" },
        { name: "steps", kind: "number-range", min: 0, max: 3 },
        { name: "facing", kind: "named-options", options: ["up", "down", "left", "right"] },
        { name: "note", kind: "string", maxLength: 10 },
      ],
    },
    { type: "pass", params: [] },
  ],
};

const goodMove: MoveResponse = {
  type: "move",
  params: { dir: true, steps: 2, facing: "left", note: "hi" },
};

describe("validateMoveResponse", () => {
  it("accepts a well-formed response", () => {
    expect(validateMoveResponse(offering, goodMove).ok).toBe(true);
  });

  it("accepts a paramless move", () => {
    expect(validateMoveResponse(offering, { type: "pass", params: {} }).ok).toBe(true);
  });

  it("rejects unknown move type", () => {
    const r = validateMoveResponse(offering, { type: "fly", params: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unknown move type/i);
  });

  it("rejects unexpected param keys", () => {
    const r = validateMoveResponse(offering, {
      type: "move",
      params: { ...goodMove.params, extra: "x" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unexpected param/i);
  });

  it("rejects missing params", () => {
    const r = validateMoveResponse(offering, {
      type: "move",
      params: { dir: true, steps: 1, facing: "up" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/missing param "note"/i);
  });

  it("rejects wrong types per kind", () => {
    expect(
      validateMoveResponse(offering, {
        type: "move",
        params: { ...goodMove.params, dir: "forward" },
      }).ok,
    ).toBe(false);
    expect(
      validateMoveResponse(offering, {
        type: "move",
        params: { ...goodMove.params, steps: "2" },
      }).ok,
    ).toBe(false);
    expect(
      validateMoveResponse(offering, {
        type: "move",
        params: { ...goodMove.params, facing: 1 },
      }).ok,
    ).toBe(false);
  });

  it("enforces number-range bounds", () => {
    expect(
      validateMoveResponse(offering, {
        type: "move",
        params: { ...goodMove.params, steps: 4 },
      }).ok,
    ).toBe(false);
    expect(
      validateMoveResponse(offering, {
        type: "move",
        params: { ...goodMove.params, steps: -1 },
      }).ok,
    ).toBe(false);
  });

  it("enforces number-range step alignment", () => {
    const stepped: MoveOffering = {
      options: [
        { type: "x", params: [{ name: "n", kind: "number-range", min: 0, max: 10, step: 2 }] },
      ],
    };
    expect(validateMoveResponse(stepped, { type: "x", params: { n: 4 } }).ok).toBe(true);
    expect(validateMoveResponse(stepped, { type: "x", params: { n: 3 } }).ok).toBe(false);
  });

  it("enforces named-options membership", () => {
    const r = validateMoveResponse(offering, {
      type: "move",
      params: { ...goodMove.params, facing: "diagonal" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not in/i);
  });

  it("enforces string length bounds", () => {
    expect(
      validateMoveResponse(offering, {
        type: "move",
        params: { ...goodMove.params, note: "x".repeat(11) },
      }).ok,
    ).toBe(false);
    const minLen: MoveOffering = {
      options: [{ type: "y", params: [{ name: "w", kind: "string", maxLength: 5, minLength: 2 }] }],
    };
    expect(validateMoveResponse(minLen, { type: "y", params: { w: "a" } }).ok).toBe(false);
    expect(validateMoveResponse(minLen, { type: "y", params: { w: "ab" } }).ok).toBe(true);
  });
});
