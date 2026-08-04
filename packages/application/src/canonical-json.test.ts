import { describe, expect, it } from "vitest";
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

  it("normalizes negative zero and produces the same hash for semantic equality", () => {
    expect(canonicalJson({ value: -0 })).toBe('{"value":0}');
    expect(canonicalSha256({ b: 2, a: 1 })).toBe(
      canonicalSha256({ a: 1, b: 2 }),
    );
    expect(canonicalSha256([1, 2])).not.toBe(canonicalSha256([2, 1]));
    expect(canonicalSha256({ a: 1 })).toMatch(/^[a-f0-9]{64}$/u);
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
});
