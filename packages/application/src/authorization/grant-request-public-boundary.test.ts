import { describe, expect, it, vi } from "vitest";
import { validateAgentGrantRequest } from "./grant-request";
import type { ResourceSelector } from "./types";

const owner = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T14:00:00.000Z";

function request(ids: string[] = ["attention_1"]) {
  return {
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: null,
    capabilities: ["attention.write"] as const,
    resourceSelectors: {
      attention_item: [{ kind: "exact_ids" as const, ids }],
    },
    riskCeiling: "medium" as const,
    expiresAt: null,
    reason: "Allow supervised attention maintenance.",
  };
}

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

describe("grant request public boundary", () => {
  it("validates selector lists without invoking caller iterators", () => {
    const iteratorGetter = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    const selectors: ResourceSelector[] = [
      { kind: "exact_ids", ids: ["attention_1"] },
    ];
    Object.defineProperty(selectors, Symbol.iterator, {
      configurable: true,
      get: iteratorGetter,
    });

    expect(
      validateAgentGrantRequest({
        actor: owner,
        request: {
          ...request(),
          resourceSelectors: { attention_item: selectors },
        },
        now,
        explicitAllResourceKinds: [],
      }).resourceSelectors,
    ).toEqual({
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    });
    expect(iteratorGetter).not.toHaveBeenCalled();
  });

  it("rejects selector accessors without invoking them", () => {
    const getter = vi.fn(
      (): ResourceSelector => ({
        kind: "exact_ids",
        ids: ["attention_1"],
      }),
    );

    expect(() =>
      validateAgentGrantRequest({
        actor: owner,
        request: {
          ...request(),
          resourceSelectors: {
            attention_item: accessorArray(getter),
          },
        },
        now,
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_RESOURCE_SELECTOR_MISSING");
    expect(getter).not.toHaveBeenCalled();
  });

  it("returns a canonical deep copy instead of caller collections", () => {
    const ids = ["attention_2", "attention_1"];
    const source = request(ids);
    const validated = validateAgentGrantRequest({
      actor: owner,
      request: source,
      now,
      explicitAllResourceKinds: [],
    });

    ids.push("attention_3");
    (source.capabilities as unknown as string[]).push("growth.write");

    expect(validated.capabilities).toEqual(["attention.write"]);
    expect(validated.resourceSelectors).toEqual({
      attention_item: [
        { kind: "exact_ids", ids: ["attention_1", "attention_2"] },
      ],
    });
  });
});
