import { describe, expect, it, vi } from "vitest";
import { readOwnDataArray } from "./data-array";

describe("authorization own-data arrays", () => {
  it("returns ordinary entries in caller order", () => {
    expect(readOwnDataArray([])).toEqual([]);
    expect(readOwnDataArray(["second", "first"])).toEqual([
      "second",
      "first",
    ]);
  });

  it("rejects non-arrays, sparse arrays and excessive sizes", () => {
    expect(readOwnDataArray(null)).toBeNull();
    expect(readOwnDataArray({})).toBeNull();
    expect(readOwnDataArray(new Array(1))).toBeNull();
    expect(readOwnDataArray([1, 2], { maximumItems: 1 })).toBeNull();
  });

  it("rejects accessor-backed entries without invoking them", () => {
    const getter = vi.fn(() => "selector");
    const value: string[] = [];
    Object.defineProperty(value, "0", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    value.length = 1;

    expect(readOwnDataArray(value)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("supports minimum cardinality", () => {
    expect(readOwnDataArray([], { minimumItems: 1 })).toBeNull();
    expect(readOwnDataArray(["one"], { minimumItems: 1 })).toEqual([
      "one",
    ]);
  });

  it("rejects unsafe or contradictory bounds", () => {
    for (const bounds of [
      { minimumItems: -1 },
      { minimumItems: 2, maximumItems: 1 },
      { maximumItems: 1.5 },
    ]) {
      expect(readOwnDataArray([], bounds)).toBeNull();
    }
  });
});
