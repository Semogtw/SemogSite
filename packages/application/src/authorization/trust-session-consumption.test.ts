import { describe, expect, it } from "vitest";
import { planTrustSessionOperationConsumption } from "./trust-session";
import type {
  AgentTrustSession,
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
} from "./types";

const selectors: ResourceSelectorMap = {
  attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
};

const authorization: EffectiveAgentAuthorization = {
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
    version: 3,
    ...overrides,
  };
}

const command = {
  capability: "attention.write" as const,
  resource: {
    kind: "attention_item",
    id: "attention_1",
    parentRefs: [] as const,
    lifecycleState: "open",
  },
  risk: "medium" as const,
  now: "2026-08-04T20:00:00.000Z",
};

describe("trust operation consumption planning", () => {
  it("plans exactly one optimistic operation increment", () => {
    expect(
      planTrustSessionOperationConsumption({
        session: session(),
        baseAuthorization: authorization,
        ...command,
      }),
    ).toEqual({
      trustSessionId: "trust_1",
      expectedVersion: 3,
      nextVersion: 4,
      expectedOperationsUsed: 0,
      nextOperationsUsed: 1,
      consumedAt: "2026-08-04T20:00:00.000Z",
    });
  });

  it("allows the final available operation but not one beyond the limit", () => {
    expect(
      planTrustSessionOperationConsumption({
        session: session({ operationsUsed: 24 }),
        baseAuthorization: authorization,
        ...command,
      }),
    ).toMatchObject({
      expectedOperationsUsed: 24,
      nextOperationsUsed: 25,
    });

    expect(
      planTrustSessionOperationConsumption({
        session: session({ operationsUsed: 25 }),
        baseAuthorization: authorization,
        ...command,
      }),
    ).toBeNull();
  });

  it.each([
    session({ expiresAt: command.now }),
    session({ revokedAt: "2026-08-04T19:30:00.000Z" }),
    session({ clientId: "client_other" }),
    session({ version: 0 }),
    session({ operationsUsed: 26 }),
  ])("does not plan from an invalid or inactive session %#", (candidate) => {
    expect(
      planTrustSessionOperationConsumption({
        session: candidate,
        baseAuthorization: authorization,
        ...command,
      }),
    ).toBeNull();
  });

  it("does not plan for a resource, capability or risk outside trust", () => {
    expect(
      planTrustSessionOperationConsumption({
        session: session(),
        baseAuthorization: authorization,
        ...command,
        resource: { ...command.resource, id: "attention_2" },
      }),
    ).toBeNull();

    expect(
      planTrustSessionOperationConsumption({
        session: session(),
        baseAuthorization: authorization,
        ...command,
        capability: "roadmap.write",
        resource: {
          kind: "stage",
          id: "stage_1",
          parentRefs: [],
          lifecycleState: "active",
        },
      }),
    ).toBeNull();

    expect(
      planTrustSessionOperationConsumption({
        session: session(),
        baseAuthorization: authorization,
        ...command,
        risk: "high",
      }),
    ).toBeNull();
  });

  it("fails closed for a non-canonical consumption time", () => {
    expect(
      planTrustSessionOperationConsumption({
        session: session(),
        baseAuthorization: authorization,
        ...command,
        now: "2026-02-31T20:00:00.000Z",
      }),
    ).toBeNull();
  });
});
