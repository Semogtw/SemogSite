import { describe, expect, it } from "vitest";
import { planAgentGrantRevocation } from "./grant-revocation";
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
    expiresAt: null,
    version: 3,
    ...overrides,
  };
}

const owner = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T06:30:00.000Z";

describe("agent grant revocation cascade planning", () => {
  it("binds grant revocation and dependent trust sessions atomically", () => {
    expect(
      planAgentGrantRevocation({
        actor: owner,
        grant: grant(),
        activeTrustSessionIds: ["trust_2", "trust_1"],
        now,
        reason: "Remove the integration authorization.",
      }),
    ).toEqual({
      grantId: "grant_1",
      ownerId: "owner_1",
      clientId: "client_1",
      fromStatus: "active",
      toStatus: "revoked",
      expectedVersion: 3,
      nextVersion: 4,
      revokeTrustSessionIds: ["trust_1", "trust_2"],
      changedAt: now,
      reason: "Remove the integration authorization.",
    });
  });

  it("supports revocation from a suspended grant", () => {
    expect(
      planAgentGrantRevocation({
        actor: owner,
        grant: grant({ status: "suspended" }),
        activeTrustSessionIds: [],
        now,
        reason: "Finalize removal after review.",
      }),
    ).toMatchObject({
      fromStatus: "suspended",
      toStatus: "revoked",
      revokeTrustSessionIds: [],
    });
  });

  it("inherits owner-only and terminal grant protections", () => {
    expect(() =>
      planAgentGrantRevocation({
        actor: { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
        grant: grant(),
        activeTrustSessionIds: [],
        now,
        reason: "Self-revocation attempt.",
      }),
    ).toThrow("AGENT_GRANT_OWNER_REQUIRED");

    expect(() =>
      planAgentGrantRevocation({
        actor: owner,
        grant: grant({ status: "revoked" }),
        activeTrustSessionIds: [],
        now,
        reason: "Repeat revocation.",
      }),
    ).toThrow("AGENT_GRANT_TERMINAL");
  });

  it("rejects malformed, duplicate or excessive dependent IDs", () => {
    for (const activeTrustSessionIds of [
      [" trust_1"],
      [""],
      ["x".repeat(201)],
      ["trust_1", "trust_1"],
      Array.from({ length: 10_001 }, (_, index) => `trust_${index}`),
    ]) {
      expect(() =>
        planAgentGrantRevocation({
          actor: owner,
          grant: grant(),
          activeTrustSessionIds,
          now,
          reason: "Remove the authorization.",
        }),
      ).toThrow("AGENT_GRANT_REVOCATION_INVALID");
    }
  });
});
