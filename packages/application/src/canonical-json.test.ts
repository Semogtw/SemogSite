import { describe, expect, it, vi } from "vitest";
import { canonicalJson, canonicalSha256 } from "./canonical-json";

describe("canonicalJson", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(
      canonicalJson({
        z: 1,
        nested: { b: true, a: "value" },
        list: [{ y: 2, x: 1 }, "end"],
      }),
    ).toBe(
      '{"list":[{"x":1,"y":2},"end"],"nested":{"a":"value","b":true},"z":1}',
    );
  });

  it("normalizes negative zero and produces the same hash for semantic equality", async () => {
    expect(canonicalJson({ value: -0 })).toBe('{"value":0}');
    await expect(canonicalSha256({ b: 2, a: 1 })).resolves.toBe(
      await canonicalSha256({ a: 1, b: 2 }),
    );
    expect(await canonicalSha256([1, 2])).not.toBe(
      await canonicalSha256([2, 1]),
    );
    await expect(canonicalSha256({ a: 1 })).resolves.toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it.each([
    ["undefined", { value: undefined }],
    ["function", { value: () => true }],
    ["symbol", { value: Symbol("value") }],
    ["bigint", { value: 1n }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["date", { value: new Date("2026-08-04T00:00:00.000Z") }],
  ])("rejects non-canonical %s values", (_name, value) => {
    expect(() => canonicalJson(value)).toThrow("CANONICAL_JSON_INVALID");
  });

  it("rejects cycles and sparse arrays", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = [1, 2];
    delete sparse[0];

    expect(() => canonicalJson(cyclic)).toThrow("CANONICAL_JSON_CYCLE");
    expect(() => canonicalJson(sparse)).toThrow("CANONICAL_JSON_INVALID");
  });

  it("rejects array accessors without invoking them", () => {
    const getter = vi.fn(() => 1);
    const value: unknown[] = [];
    Object.defineProperty(value, "0", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    value.length = 1;

    expect(() => canonicalJson(value)).toThrow("CANONICAL_JSON_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("does not execute methods from a custom array prototype", () => {
    const map = vi.fn(() => {
      throw new Error("custom map must not run");
    });
    const value = [1];
    Object.setPrototypeOf(value, { map });

    expect(() => canonicalJson(value)).toThrow("CANONICAL_JSON_INVALID");
    expect(map).not.toHaveBeenCalled();
  });

  it("serializes null-prototype arrays without inherited methods", () => {
    const value = [1, { b: 2, a: 1 }];
    Object.setPrototypeOf(value, null);

    expect(canonicalJson(value)).toBe('[1,{"a":1,"b":2}]');
  });
});
