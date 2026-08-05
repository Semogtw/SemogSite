import { describe, expect, it, vi } from "vitest";
import {
  evaluateTrustSessionState,
  trustSessionCoversCommand,
  trustSessionFitsAuthorization,
  validateTrustSessionRequest,
} from "./trust-session";
import type {
  AgentCapability,
  AgentTrustSession,
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
} from "./types";

const now = "2026-08-04T20:00:00.000Z";
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

function session(
  overrides: Partial<AgentTrustSession> = {},
): AgentTrustSession {
  return {
    id: "trust_1",
    ownerId: "owner_1",
    clientId: "client_1",
    baseGrantIds: ["grant_1"],
    capabilities: ["attention.write"],
    resourceSelectors: selectors,
    riskCeiling: "medium",
    startsAt: "2026-08-04T19:00:00.000Z",
    expiresAt: "2026-08-04T21:00:00.000Z",
    maxOperations: 25,
    operationsUsed: 0,
    revokedAt: null,
    reason: "Sessão supervisionada.",
    version: 1,
    ...overrides,
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

describe("trust-session public boundaries", () => {
  it("rejects capability accessors in direct request validation", () => {
    const getter = vi.fn(() => "attention.write" as AgentCapability);

    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 60,
        maxOperations: 10,
        riskCeiling: "medium",
        requestedCapabilities: accessorArray(getter),
        requestedResources: selectors,
        baseAuthorization: authorization(),
      }),
    ).toThrow("TRUST_CAPABILITY_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("does not invoke base-authorization includes during validation", () => {
    const baseAuthorization = authorization();
    const includes = poisonMethod(
      baseAuthorization.capabilities as AgentCapability[],
      "includes",
    );

    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 60,
        maxOperations: 10,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: selectors,
        baseAuthorization,
      }),
    ).not.toThrow();
    expect(includes).not.toHaveBeenCalled();
  });

  it("marks accessor-backed persisted capabilities invalid without invoking them", () => {
    const getter = vi.fn(() => "attention.write" as AgentCapability);

    expect(
      evaluateTrustSessionState(
        session({ capabilities: accessorArray(getter) }),
        now,
      ),
    ).toBe("invalid");
    expect(getter).not.toHaveBeenCalled();
  });

  it("fails closed without invoking authorization clause accessors", () => {
    const getter = vi.fn(() => authorization().authorizationClauses[0]!);
    const baseAuthorization = authorization();
    baseAuthorization.authorizationClauses = accessorArray(getter);

    expect(
      trustSessionFitsAuthorization({
        session: session(),
        baseAuthorization,
        now,
      }),
    ).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("covers commands without invoking caller array methods", () => {
    const candidate = session();
    const capabilityIncludes = poisonMethod(
      candidate.capabilities as AgentCapability[],
      "includes",
    );
    const selectorSome = poisonMethod(
      candidate.resourceSelectors.attention_item as unknown[],
      "some",
    );
    const baseAuthorization = authorization();
    const clauseFilter = poisonMethod(
      baseAuthorization.authorizationClauses as unknown[],
      "filter",
    );

    expect(
      trustSessionCoversCommand({
        session: candidate,
        baseAuthorization,
        capability: "attention.write",
        resource: {
          kind: "attention_item",
          id: "attention_1",
          parentRefs: [],
          lifecycleState: "open",
        },
        risk: "medium",
        now,
      }),
    ).toBe(true);
    expect(capabilityIncludes).not.toHaveBeenCalled();
    expect(selectorSome).not.toHaveBeenCalled();
    expect(clauseFilter).not.toHaveBeenCalled();
  });
});
