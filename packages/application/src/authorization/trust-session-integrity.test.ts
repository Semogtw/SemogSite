import { describe, expect, it } from "vitest";
import {
  evaluateTrustSessionState,
  trustSessionFitsAuthorization,
} from "./trust-session";
import type {
  AgentTrustSession,
  EffectiveAgentAuthorization,
} from "./types";

const selectors = {
  attention_item: [{ kind: "exact_ids" as const, ids: ["attention_1"] }],
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

const now = "2026-08-04T20:00:00.000Z";

describe("trust clause runtime integrity", () => {
  it.each([
    [" grant_1"],
    ["grant_1 "],
    [""],
    [1 as never],
    ["x".repeat(201)],
  ])("rejects malformed base grant IDs %#", (baseGrantIds) => {
    expect(
      evaluateTrustSessionState(session({ baseGrantIds }), now),
    ).toBe("invalid");
  });

  it("returns false for a malformed authorization clause array", () => {
    const malformed = authorization();
    malformed.authorizationClauses = [null as never];
    expect(() =>
      trustSessionFitsAuthorization({
        session: session(),
        baseAuthorization: malformed,
        now,
      }),
    ).not.toThrow();
    expect(
      trustSessionFitsAuthorization({
        session: session(),
        baseAuthorization: malformed,
        now,
      }),
    ).toBe(false);
  });

  it("does not accept a clause whose grant ID is not in the persisted grant set", () => {
    const malformed = authorization();
    malformed.authorizationClauses = [
      {
        ...malformed.authorizationClauses[0]!,
        grantId: "grant_other",
      },
    ];
    expect(
      trustSessionFitsAuthorization({
        session: session(),
        baseAuthorization: malformed,
        now,
      }),
    ).toBe(false);
  });
});
