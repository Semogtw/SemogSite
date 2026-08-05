import { describe, expect, it, vi } from "vitest";
import { decideAgentCommandDisposition } from "./policy-engine";
import type {
  AgentCapability,
  EffectiveAgentAuthorization,
  ResourceSelector,
  ResourceSelectorMap,
} from "./types";

const selectors: ResourceSelectorMap = {
  attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
};

function authorization(): EffectiveAgentAuthorization {
  return {
    clientId: "client_1",
    ownerId: "owner_1",
    capabilities: ["attention.write"],
    resourceSelectors: selectors,
    capabilityResourceSelectors: { "attention.write": selectors },
    riskCeiling: "medium",
    riskCeilingByCapability: { "attention.write": "medium" },
    authorizationClauses: [
      {
        grantId: "grant_1",
        capability: "attention.write",
        resourceSelectors: selectors,
        riskCeiling: "medium",
      },
    ],
    grantIds: ["grant_1"],
    trustSessionIds: [],
  };
}

const input = {
  command: {
    capability: "attention.write" as const,
    domain: "attention",
    risk: "low" as const,
    resource: {
      kind: "attention_item",
      id: "attention_1",
      parentRefs: [] as const,
      lifecycleState: "open",
    },
  },
  writeSwitches: {
    globalEnabled: true,
    clientEnabled: true,
    domainEnabled: true,
  },
  trustCoversCommand: false,
  confirmationValid: false,
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

function poisonMethod<T extends unknown[]>(
  value: T,
  method: "includes" | "filter" | "some",
): ReturnType<typeof vi.fn> {
  const poisoned = vi.fn(() => {
    throw new Error(`caller ${method} must not run`);
  });
  Object.defineProperty(value, method, {
    configurable: true,
    value: poisoned,
  });
  return poisoned;
}

describe("policy engine public authorization boundary", () => {
  it("allows from a valid copy without invoking caller array methods", () => {
    const candidate = authorization();
    const includes = poisonMethod(
      candidate.capabilities as AgentCapability[],
      "includes",
    );
    const filter = poisonMethod(
      candidate.authorizationClauses as unknown[],
      "filter",
    );
    const some = poisonMethod(
      candidate.authorizationClauses[0]!.resourceSelectors
        .attention_item as ResourceSelector[],
      "some",
    );

    expect(
      decideAgentCommandDisposition({
        ...input,
        authorization: candidate,
      }),
    ).toEqual({
      outcome: "allow",
      risk: "low",
      reasonCode: "LOW_RISK_ALLOWED",
      approvalId: null,
    });
    expect(includes).not.toHaveBeenCalled();
    expect(filter).not.toHaveBeenCalled();
    expect(some).not.toHaveBeenCalled();
  });

  it("denies accessor-backed clauses without invoking them", () => {
    const getter = vi.fn(() => authorization().authorizationClauses[0]!);
    const candidate = authorization();
    candidate.authorizationClauses = accessorArray(getter);

    expect(
      decideAgentCommandDisposition({
        ...input,
        authorization: candidate,
      }),
    ).toEqual({
      outcome: "deny",
      risk: "low",
      reasonCode: "NO_EFFECTIVE_GRANT",
      approvalId: null,
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("copies nested selector IDs without invoking caller iterators", () => {
    const iteratorGetter = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    const candidate = authorization();
    const clauseSelectors = candidate.authorizationClauses[0]!
      .resourceSelectors.attention_item as Array<{
      kind: "exact_ids";
      ids: string[];
    }>;
    Object.defineProperty(clauseSelectors[0]!.ids, Symbol.iterator, {
      configurable: true,
      get: iteratorGetter,
    });

    expect(
      decideAgentCommandDisposition({
        ...input,
        authorization: candidate,
      }).outcome,
    ).toBe("allow");
    expect(iteratorGetter).not.toHaveBeenCalled();
  });
});
