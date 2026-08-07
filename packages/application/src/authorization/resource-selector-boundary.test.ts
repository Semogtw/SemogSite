import { describe, expect, it, vi } from "vitest";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type { ResourceSelector, ResourceSelectorMap } from "./types";

function accessorArray<T>(getter: () => T): T[] {
  const value: T[] = [];
  Object.defineProperty(value, "0", {
    configurable: true,
    enumerable: true,
    get: getter,
  });
  value.length = 1;
  return value;
}

describe("resource selector map boundary", () => {
  it("returns a deterministic deep copy of validated selectors", () => {
    const ids = ["attention_2", "attention_1"];
    const source: ResourceSelectorMap = {
      attention_item: [{ kind: "exact_ids", ids }],
    };

    const sanitized = sanitizeResourceSelectorMapBoundary(source);
    ids.push("attention_3");
    (source.attention_item as ResourceSelector[]).push({
      kind: "lifecycle_states",
      states: ["open"],
    });

    expect(sanitized).toEqual({
      attention_item: [
        { kind: "exact_ids", ids: ["attention_1", "attention_2"] },
      ],
    });
  });

  it("rejects sparse selector lists", () => {
    expect(() =>
      sanitizeResourceSelectorMapBoundary({
        attention_item: new Array(1) as ResourceSelector[],
      }),
    ).toThrow("RESOURCE_SELECTOR_LIST_INVALID");
  });

  it("rejects selector-list accessors without invoking them", () => {
    const getter = vi.fn(
      (): ResourceSelector => ({
        kind: "exact_ids",
        ids: ["attention_1"],
      }),
    );

    expect(() =>
      sanitizeResourceSelectorMapBoundary({
        attention_item: accessorArray(getter),
      }),
    ).toThrow("RESOURCE_SELECTOR_LIST_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("copies nested values without invoking caller iterators", () => {
    const iteratorGetter = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    const ids = ["attention_1"];
    Object.defineProperty(ids, Symbol.iterator, {
      configurable: true,
      get: iteratorGetter,
    });

    expect(
      sanitizeResourceSelectorMapBoundary({
        attention_item: [{ kind: "exact_ids", ids }],
      }),
    ).toEqual({
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    });
    expect(iteratorGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed map entries without invoking them", () => {
    const getter = vi.fn(() => [
      { kind: "exact_ids", ids: ["attention_1"] },
    ]);
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, "attention_item", {
      configurable: true,
      enumerable: true,
      get: getter,
    });

    expect(() =>
      sanitizeResourceSelectorMapBoundary(source as ResourceSelectorMap),
    ).toThrow("RESOURCE_SELECTOR_MAP_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });
});
