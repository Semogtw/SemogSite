import { describe, expect, it, vi } from "vitest";
import { sanitizeEffectiveAgentAuthorizationBoundary } from "./effective-authorization-boundary";
import type {
  AgentCapability,
  EffectiveAgentAuthorization,
  EffectiveAgentAuthorizationClause,
} from "./types";

function authorization(): EffectiveAgentAuthorization {
  return {
    clientId: "client_1",
    ownerId: "owner_1",
    capabilities: ["roadmap.write", "attention.write"],
    resourceSelectors: {
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
      stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
    },
    capabilityResourceSelectors: {
      "attention.write": {
        attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
      },
      "roadmap.write": {
        stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
      },
    },
    riskCeiling: "high",
    riskCeilingByCapability: {
      "attention.write": "medium",
      "roadmap.write": "high",
    },
    authorizationClauses: [
      {
        grantId: "grant_2",
        capability: "roadmap.write",
        resourceSelectors: {
          stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
        },
        riskCeiling: "high",
      },
      {
        grantId: "grant_1",
        capability: "attention.write",
        resourceSelectors: {
          attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
        },
        riskCeiling: "medium",
      },
    ],
    grantIds: ["grant_2", "grant_1"],
    trustSessionIds: ["trust_2", "trust_1"],
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

describe("effective authorization boundary", () => {
  it("returns a normalized deep copy", () => {
    const source = authorization();
    const sanitized = sanitizeEffectiveAgentAuthorizationBoundary(source);

    (source.capabilities as AgentCapability[]).push("growth.write");
    const sourceSelectors = source.resourceSelectors.attention_item as Array<{
      kind: "exact_ids";
      ids: string[];
    }>;
    sourceSelectors[0]!.ids.push("attention_2");

    expect(sanitized.capabilities).toEqual([
      "attention.write",
      "roadmap.write",
    ]);
    expect(sanitized.grantIds).toEqual(["grant_1", "grant_2"]);
    expect(sanitized.trustSessionIds).toEqual(["trust_1", "trust_2"]);
    expect(sanitized.resourceSelectors.attention_item).toEqual([
      { kind: "exact_ids", ids: ["attention_1"] },
    ]);
  });

  it("rejects sparse capabilities", () => {
    expect(() =>
      sanitizeEffectiveAgentAuthorizationBoundary({
        ...authorization(),
        capabilities: new Array(1) as AgentCapability[],
      }),
    ).toThrow("EFFECTIVE_AUTHORIZATION_INVALID");
  });

  it("rejects capability accessors without invoking them", () => {
    const getter = vi.fn(() => "attention.write" as const);

    expect(() =>
      sanitizeEffectiveAgentAuthorizationBoundary({
        ...authorization(),
        capabilities: accessorArray(getter),
      }),
    ).toThrow("EFFECTIVE_AUTHORIZATION_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects sparse authorization clauses", () => {
    expect(() =>
      sanitizeEffectiveAgentAuthorizationBoundary({
        ...authorization(),
        authorizationClauses:
          new Array(1) as EffectiveAgentAuthorizationClause[],
      }),
    ).toThrow("EFFECTIVE_AUTHORIZATION_INVALID");
  });

  it("rejects clause accessors without invoking them", () => {
    const getter = vi.fn(
      (): EffectiveAgentAuthorizationClause => ({
        grantId: "grant_1",
        capability: "attention.write",
        resourceSelectors: {
          attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
        },
        riskCeiling: "medium",
      }),
    );

    expect(() =>
      sanitizeEffectiveAgentAuthorizationBoundary({
        ...authorization(),
        authorizationClauses: accessorArray(getter),
      }),
    ).toThrow("EFFECTIVE_AUTHORIZATION_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed capability selector maps", () => {
    const getter = vi.fn(() => ({
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    }));
    const capabilityResourceSelectors: Record<string, unknown> = {};
    Object.defineProperty(capabilityResourceSelectors, "attention.write", {
      configurable: true,
      enumerable: true,
      get: getter,
    });

    expect(() =>
      sanitizeEffectiveAgentAuthorizationBoundary({
        ...authorization(),
        capabilityResourceSelectors:
          capabilityResourceSelectors as EffectiveAgentAuthorization["capabilityResourceSelectors"],
      }),
    ).toThrow("EFFECTIVE_AUTHORIZATION_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("copies nested clause values without invoking caller iterators", () => {
    const iteratorGetter = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    const source = authorization();
    const clause = source.authorizationClauses[0]!;
    const selectors = clause.resourceSelectors.stage as Array<{
      kind: "exact_ids";
      ids: string[];
    }>;
    Object.defineProperty(selectors[0]!.ids, Symbol.iterator, {
      configurable: true,
      get: iteratorGetter,
    });

    expect(
      sanitizeEffectiveAgentAuthorizationBoundary(source)
        .authorizationClauses[0]!.resourceSelectors.stage,
    ).toEqual([{ kind: "exact_ids", ids: ["stage_1"] }]);
    expect(iteratorGetter).not.toHaveBeenCalled();
  });
});
