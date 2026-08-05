import { describe, expect, it, vi } from "vitest";
import { validateAgentAuthorizationCatalog } from "./catalog-coverage";

const command = {
  commandId: "attention.transition",
  commandVersion: 1,
  capability: "attention.write",
  resourceType: "attention_item",
};

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

describe("authorization catalog public boundary", () => {
  it("rejects accessor entries without invoking them", () => {
    const getter = vi.fn(() => command);

    expect(() =>
      validateAgentAuthorizationCatalog(accessorArray(getter)),
    ).toThrow("AGENT_AUTHORIZATION_CATALOG_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("validates a safe copy without invoking caller map or iterator", () => {
    const values = [command];
    const map = vi.fn(() => {
      throw new Error("caller map must not run");
    });
    const iteratorGetter = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    Object.defineProperty(values, "map", {
      configurable: true,
      value: map,
    });
    Object.defineProperty(values, Symbol.iterator, {
      configurable: true,
      get: iteratorGetter,
    });

    expect(validateAgentAuthorizationCatalog(values)).toEqual([
      command,
    ]);
    expect(map).not.toHaveBeenCalled();
    expect(iteratorGetter).not.toHaveBeenCalled();
  });
});
