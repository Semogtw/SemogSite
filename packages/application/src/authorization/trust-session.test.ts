import { describe, expect, it } from "vitest";
import {
  defaultTrustDurationMinutes,
  defaultTrustMaximumOperations,
  evaluateTrustSessionState,
  maximumTrustDurationMinutes,
  maximumTrustOperations,
  minimumTrustDurationMinutes,
  trustSessionFitsAuthorization,
  validateTrustSessionRequest,
} from "./trust-session";
import type {
  AgentTrustSession,
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
} from "./types";

const baseSelectors: ResourceSelectorMap = {
  attention_item: [
    { kind: "exact_ids", ids: ["attention_1", "attention_2"] },
  ],
};

const baseAuthorization: EffectiveAgentAuthorization = {
  clientId: "client_1",
  ownerId: "owner_1",
  capabilities: ["attention.write"],
  resourceSelectors: baseSelectors,
  capabilityResourceSelectors: {
    "attention.write": baseSelectors,
  },
  riskCeiling: "medium",
  riskCeilingByCapability: { "attention.write": "medium" },
  authorizationClauses: [
    {
      grantId: "grant_1",
      capability: "attention.write",
      resourceSelectors: baseSelectors,
      riskCeiling: "medium",
    },
  ],
  grantIds: ["grant_1"],
  trustSessionIds: [],
};

const narrowResources: ResourceSelectorMap = {
  attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
};

function session(
  overrides: Partial<AgentTrustSession> = {},
): AgentTrustSession {
  return {
    id: "trust_1",
    ownerId: "owner_1",
    clientId: "client_1",
    baseGrantIds: ["grant_1"],
    capabilities: ["attention.write"],
    resourceSelectors: narrowResources,
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

describe("agent trust-session bounds", () => {
  it("publishes the fixed duration and operation limits", () => {
    expect(minimumTrustDurationMinutes).toBe(5);
    expect(defaultTrustDurationMinutes).toBe(120);
    expect(maximumTrustDurationMinutes).toBe(480);
    expect(defaultTrustMaximumOperations).toBe(25);
    expect(maximumTrustOperations).toBe(100);
  });

  it.each([4, 481, 5.5, Number.NaN])(
    "rejects invalid duration %s",
    (durationMinutes) => {
      expect(() =>
        validateTrustSessionRequest({
          durationMinutes,
          maxOperations: 25,
          riskCeiling: "medium",
          requestedCapabilities: ["attention.write"],
          requestedResources: narrowResources,
          baseAuthorization,
        }),
      ).toThrow("TRUST_DURATION_INVALID");
    },
  );

  it.each([0, 101, 2.5, Number.NaN])(
    "rejects invalid operation limit %s",
    (maxOperations) => {
      expect(() =>
        validateTrustSessionRequest({
          durationMinutes: 120,
          maxOperations,
          riskCeiling: "medium",
          requestedCapabilities: ["attention.write"],
          requestedResources: narrowResources,
          baseAuthorization,
        }),
      ).toThrow("TRUST_OPERATION_LIMIT_INVALID");
    },
  );

  it("accepts a strict capability/resource/risk subset", () => {
    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: narrowResources,
        baseAuthorization,
      }),
    ).not.toThrow();
  });

  it("rejects capability escalation", () => {
    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "medium",
        requestedCapabilities: ["roadmap.write"],
        requestedResources: {
          stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
        },
        baseAuthorization,
      }),
    ).toThrow("TRUST_CAPABILITY_NOT_GRANTED");
  });

  it("rejects a resource selector broader than the base grant", () => {
    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: {
          attention_item: [
            { kind: "exact_ids", ids: ["attention_1", "attention_3"] },
          ],
        },
        baseAuthorization,
      }),
    ).toThrow("TRUST_RESOURCE_NOT_GRANTED");
  });

  it("rejects all unless the base grant itself contains all", () => {
    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: { attention_item: [{ kind: "all" }] },
        baseAuthorization,
      }),
    ).toThrow("TRUST_RESOURCE_NOT_GRANTED");
  });

  it("rejects risk escalation and any runtime critical value", () => {
    const lowAuthorization: EffectiveAgentAuthorization = {
      ...baseAuthorization,
      riskCeiling: "low",
      riskCeilingByCapability: { "attention.write": "low" },
      authorizationClauses: [
        {
          grantId: "grant_1",
          capability: "attention.write",
          resourceSelectors: baseSelectors,
          riskCeiling: "low",
        },
      ],
    };
    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: narrowResources,
        baseAuthorization: lowAuthorization,
      }),
    ).toThrow("TRUST_RISK_ESCALATION");

    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "critical" as never,
        requestedCapabilities: ["attention.write"],
        requestedResources: narrowResources,
        baseAuthorization,
      }),
    ).toThrow("TRUST_RISK_INVALID");
  });

  it("rejects session-to-session delegation", () => {
    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: narrowResources,
        baseAuthorization,
        delegatedFromTrustSessionId: "trust_parent",
      }),
    ).toThrow("TRUST_DELEGATION_FORBIDDEN");
  });
});

describe("agent trust-session state", () => {
  const now = "2026-08-04T20:00:00.000Z";

  it.each([
    [session(), "active"],
    [session({ startsAt: "2026-08-04T20:30:00.000Z" }), "not_started"],
    [session({ expiresAt: now }), "expired"],
    [session({ operationsUsed: 25 }), "exhausted"],
    [session({ revokedAt: "2026-08-04T19:30:00.000Z" }), "revoked"],
    [session({ startsAt: "not-a-time" }), "invalid"],
    [session({ operationsUsed: 26 }), "invalid"],
    [session({ revokedAt: "2026-08-04T18:59:59.999Z" }), "invalid"],
    [session({ revokedAt: "2026-08-04T20:30:00.000Z" }), "invalid"],
    [session({ reason: " motivo com espaços " }), "invalid"],
  ] as const)("evaluates %# as %s", (candidate, expected) => {
    expect(evaluateTrustSessionState(candidate, now)).toBe(expected);
  });

  it("fits only an active session bound to the same base authorization", () => {
    expect(
      trustSessionFitsAuthorization({
        session: session(),
        baseAuthorization,
        now,
      }),
    ).toBe(true);
    expect(
      trustSessionFitsAuthorization({
        session: session({ baseGrantIds: ["grant_other"] }),
        baseAuthorization,
        now,
      }),
    ).toBe(false);
    expect(
      trustSessionFitsAuthorization({
        session: session({ clientId: "client_other" }),
        baseAuthorization,
        now,
      }),
    ).toBe(false);
  });
});
