import { describe, expect, it } from "vitest";
import { Hand } from "./hand.js";

describe("Hand", () => {
  it("starts with the provided cards", () => {
    const h = new Hand<number>("alice", [1, 2, 3]);
    expect(h.size).toBe(3);
  });

  it("add accepts single card or array", () => {
    const h = new Hand<number>("alice");
    h.add(1);
    h.add([2, 3]);
    expect(h.size).toBe(3);
  });

  it("remove pulls the first matching card", () => {
    const h = new Hand<number>("alice", [1, 2, 3, 2]);
    const removed = h.remove((c) => c === 2);
    expect(removed).toBe(2);
    expect(h.size).toBe(3);
  });

  it("remove returns undefined when nothing matches", () => {
    const h = new Hand<number>("alice", [1, 2]);
    expect(h.remove((c) => c === 99)).toBeUndefined();
    expect(h.size).toBe(2);
  });

  it("owner sees their cards", () => {
    const h = new Hand<number>("alice", [1, 2, 3]);
    const view = h.viewFor("alice");
    expect(view.ownerId).toBe("alice");
    expect(view.count).toBe(3);
    expect(view.cards).toEqual([1, 2, 3]);
  });

  it("non-owners see only the count, not the cards", () => {
    const h = new Hand<number>("alice", [1, 2, 3]);
    const view = h.viewFor("bob");
    expect(view.count).toBe(3);
    expect(view.cards).toBeUndefined();
  });

  it("reveal returns all cards regardless of viewer", () => {
    const h = new Hand<number>("alice", [7, 8]);
    expect(h.reveal()).toEqual([7, 8]);
  });

  it("viewFor returns a defensive copy", () => {
    const h = new Hand<number>("alice", [1, 2]);
    const view = h.viewFor("alice");
    (view.cards as number[]).push(99);
    expect(h.size).toBe(2);
  });
});
