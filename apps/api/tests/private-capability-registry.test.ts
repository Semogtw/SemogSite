import { describe, expect, it } from "vitest";
import { createPrivateRuntimeCapabilities } from "../src/private-capabilities";
import { privateStateWriteCapabilities } from "../src/private-capability-registry";

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

describe("private capability registry", () => {
  it("keeps operation names and endpoints unique", () => {
    expect(duplicates(privateStateWriteCapabilities.map((item) => item.name))).toEqual([]);
    expect(duplicates(privateStateWriteCapabilities.map((item) => item.path))).toEqual([]);
  });

  it("keeps every advertised mutation inside the authenticated private namespace", () => {
    for (const capability of privateStateWriteCapabilities) {
      expect(capability.method).toBe("POST");
      expect(capability.path.startsWith("/api/v1/private/")).toBe(true);
      expect(capability.externalEffect).toBe(false);
    }
  });

  it("derives the legacy stateWrites list from the endpoint registry", () => {
    const capabilities = createPrivateRuntimeCapabilities("cloudflare-worker-d1");
    expect(capabilities.stateWrites).toEqual(
      privateStateWriteCapabilities.map((item) => item.name),
    );
    expect(capabilities.stateWriteEndpoints).toEqual(privateStateWriteCapabilities);
  });

  it("does not widen external effects in either persistence runtime", () => {
    for (const runtime of ["cloudflare-worker-d1", "node-sqlite"] as const) {
      const capabilities = createPrivateRuntimeCapabilities(runtime);
      expect(Object.values(capabilities.externalEffects)).toEqual([
        false,
        false,
        false,
        false,
        false,
      ]);
    }
  });
});
