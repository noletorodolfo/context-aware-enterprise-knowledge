import { describe, expect, it } from "vitest";
import { batch, reconcile } from "./reconcile.js";

describe("reconcile", () => {
  it("deletes chunks whose document disappeared and keeps the current ones", () => {
    expect(reconcile(["a-0", "a-1", "gone-0"], ["a-0", "a-1", "new-0"])).toEqual({
      upload: ["a-0", "a-1", "new-0"],
      delete: ["gone-0"],
    });
  });

  it("deletes nothing when the index is empty", () => {
    expect(reconcile([], ["a-0"])).toEqual({ upload: ["a-0"], delete: [] });
  });

  it("deletes every chunk when the corpus became empty", () => {
    expect(reconcile(["a-0"], [])).toEqual({ upload: [], delete: ["a-0"] });
  });
});

describe("batch", () => {
  it("splits a list into chunks of the given size", () => {
    expect(batch([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for an empty list", () => {
    expect(batch([], 10)).toEqual([]);
  });
});
