import { describe, expect, it } from "vitest";
import { parseApiPort } from "./node-config";

describe("parseApiPort", () => {
  it("defaults to 3001 and accepts valid TCP ports", () => {
    expect(parseApiPort(undefined)).toBe(3001);
    expect(parseApiPort("8787")).toBe(8787);
  });

  it("rejects non-integer and out-of-range ports", () => {
    expect(() => parseApiPort("0")).toThrow("INVALID_API_PORT");
    expect(() => parseApiPort("65536")).toThrow("INVALID_API_PORT");
    expect(() => parseApiPort("3.5")).toThrow("INVALID_API_PORT");
    expect(() => parseApiPort("abc")).toThrow("INVALID_API_PORT");
  });
});
