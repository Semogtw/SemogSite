import { describe, expect, it, vi } from "vitest";
import { normalizeBoundedUniqueIds } from "./id-list";

describe("bounded unique authorization ID lists", () => {
  it("allows empty lists and returns deterministic order", () => {
    expect(normalizeBoundedUniqueIds([])).toEqual([]);
    expect(
      normalizeBoundedUniqueIds(["trust_2", "trust_1"]),
    ).toEqual(["trust_1", "trust_2"]);
  });

  it.each([
    null,
    {},
    [""],
    [" trust_1"],
    ["trust_1 "],
    ["x".repeat(201)],
    ["trust_1", "trust_1"],
    Array.from({ length: 10_001 }, (_, index) => `trust_${index}`),
  ])("rejects malformed value %#", (value) => {
    expect(normalizeBoundedUniqueIds(value)).toBeNull();
  });

  it("rejects sparse arrays rather than skipping missing entries", () => {
    expect(normalizeBoundedUniqueIds(new Array(1))).toBeNull();
  });

  it("rejects accessor-backed entries without invoking the getter", () => {
    const getter = vi.fn(() => "trust_1");
    const value: string[] = [];
    Object.defineProperty(value, "0", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    value.length = 1;

    expect(normalizeBoundedUniqueIds(value)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("supports stricter call-site bounds", () => {
    expect(
      normalizeBoundedUniqueIds(["id_1", "id_2"], {
        maximumItems: 1,
      }),
    ).toBeNull();
    expect(
      normalizeBoundedUniqueIds(["identifier"], {
        maximumLength: 5,
      }),
    ).toBeNull();
  });
});
