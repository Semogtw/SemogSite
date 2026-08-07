import { describe, expect, it } from "vitest";
import { planAgentGrantExpiration } from "./grant-expiration";
import type { AgentGrantDefinition } from "./types";

function grant(
  overrides: Partial<AgentGrantDefinition> = {},
): AgentGrantDefinition {
  return {
    id: "grant_1",
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: null,
    status: "active",
    capabilities: ["attention.write"],
    resourceSelectors: {
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    },
    riskCeiling: "medium",
    expiresAt: "2026-08-05T10:00:00.000Z",
    version: 4,
    ...overrides,
  };
}

const actor = { kind: "system" as const, actorId: "authorization_sweeper" };
const now = "2026-08-05T11:00:00.000Z";

describe("agent grant expiration planning", () => {
  it("plans an atomic expiration and dependent trust revocation", () => {
    expect(
      planAgentGrantExpiration({
        actor,
        grant: grant(),
        activeTrustSessionIds: ["trust_2", "trust_1"],
        now,
        reason: "The grant reached its configured expiry.",
      }),
    ).toEqual({
      grantId: "grant_1",
      ownerId: "owner_1",
      clientId: "client_1",
      fromStatus: "active",
      toStatus: "expired",
      expectedVersion: 4,
      nextVersion: 5,
      revokeTrustSessionIds: ["trust_1", "trust_2"],
      expiredAt: now,
      triggeredByActorId: "authorization_sweeper",
      reason: "The grant reached its configured expiry.",
    });
  });

  it("supports expiration of a suspended grant", () => {
    expect(
      planAgentGrantExpiration({
        actor,
        grant: grant({ status: "suspended" }),
        activeTrustSessionIds: [],
        now,
        reason: "The suspended grant also reached expiry.",
      }),
    ).toMatchObject({
      fromStatus: "suspended",
      toStatus: "expired",
      revokeTrustSessionIds: [],
    });
  });

  it.each([
    { kind: "owner_ui", actorId: "owner_1" },
    { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
    { kind: "external_adapter", actorId: "adapter_1", adapterId: "adapter_1" },
  ] as const)("requires the system actor %#", (invalidActor) => {
    expect(() =>
      planAgentGrantExpiration({
        actor: invalidActor,
        grant: grant(),
        activeTrustSessionIds: [],
        now,
        reason: "Attempt automatic expiry.",
      }),
    ).toThrow("AGENT_GRANT_EXPIRATION_SYSTEM_REQUIRED");
  });

  it("rejects grants that have not reached their expiry", () => {
    for (const candidate of [
      grant({ expiresAt: null }),
      grant({ expiresAt: "2026-08-05T12:00:00.000Z" }),
    ]) {
      expect(() =>
        planAgentGrantExpiration({
          actor,
          grant: candidate,
          activeTrustSessionIds: [],
          now,
          reason: "Run expiry sweep.",
        }),
      ).toThrow("AGENT_GRANT_NOT_EXPIRED");
    }
  });

  it("returns no write plan when expiration was already persisted", () => {
    expect(
      planAgentGrantExpiration({
        actor,
        grant: grant({ status: "expired" }),
        activeTrustSessionIds: [],
        now,
        reason: "Repeat expiry sweep.",
      }),
    ).toBeNull();
  });

  it("preserves revoked as a distinct terminal state", () => {
    expect(() =>
      planAgentGrantExpiration({
        actor,
        grant: grant({ status: "revoked" }),
        activeTrustSessionIds: [],
        now,
        reason: "Do not rewrite revocation as expiry.",
      }),
    ).toThrow("AGENT_GRANT_TERMINAL");
  });

  it("rejects malformed sweep context and dependent IDs", () => {
    const invalidInputs = [
      { actor: { kind: "system" as const, actorId: " system" } },
      { now: "2026-02-31T11:00:00.000Z" },
      { reason: "" },
      { activeTrustSessionIds: ["trust_1", "trust_1"] },
      { activeTrustSessionIds: [" trust_1"] },
      { activeTrustSessionIds: Array.from({ length: 10_001 }, (_, index) => `trust_${index}`) },
    ];

    for (const overrides of invalidInputs) {
      expect(() =>
        planAgentGrantExpiration({
          actor,
          grant: grant(),
          activeTrustSessionIds: [],
          now,
          reason: "Run expiry sweep.",
          ...overrides,
        }),
      ).toThrow("AGENT_GRANT_EXPIRATION_INVALID");
    }
  });
});
