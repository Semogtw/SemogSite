import { describe, expect, it } from "vitest";
import { planAgentGrantRevision } from "./grant-revision";
import type { AgentGrantRequest } from "./grant-request";
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
    version: 7,
    ...overrides,
  };
}

function request(
  overrides: Partial<AgentGrantRequest> = {},
): AgentGrantRequest {
  return {
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: "profile_2",
    capabilities: ["roadmap.write", "attention.write"],
    resourceSelectors: {
      stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    },
    riskCeiling: "high",
    expiresAt: "2026-08-06T12:00:00.000Z",
    reason: "Broaden the owner-approved maintenance scope.",
    ...overrides,
  };
}

const actor = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T12:00:00.000Z";

describe("agent grant revision planning", () => {
  it("replaces grant policy under CAS and revokes derived trust", () => {
    expect(
      planAgentGrantRevision({
        actor,
        grant: grant(),
        request: request(),
        explicitAllResourceKinds: [],
        activeTrustSessionIds: ["trust_2", "trust_1"],
        now,
      }),
    ).toEqual({
      grantId: "grant_1",
      ownerId: "owner_1",
      clientId: "client_1",
      fromStatus: "active",
      expectedVersion: 7,
      nextVersion: 8,
      nextGrant: {
        id: "grant_1",
        ownerId: "owner_1",
        clientId: "client_1",
        profileId: "profile_2",
        status: "active",
        capabilities: ["attention.write", "roadmap.write"],
        resourceSelectors: {
          attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
          stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
        },
        riskCeiling: "high",
        expiresAt: "2026-08-06T12:00:00.000Z",
        version: 8,
      },
      revokeTrustSessionIds: ["trust_1", "trust_2"],
      changedAt: now,
      reason: "Broaden the owner-approved maintenance scope.",
    });
  });

  it("preserves a suspended grant while changing its policy", () => {
    expect(
      planAgentGrantRevision({
        actor,
        grant: grant({ status: "suspended" }),
        request: request(),
        explicitAllResourceKinds: [],
        activeTrustSessionIds: [],
        now,
      }),
    ).toMatchObject({
      fromStatus: "suspended",
      nextGrant: { status: "suspended", version: 8 },
    });
  });

  it("forbids owner and client identity replacement", () => {
    for (const revisedRequest of [
      request({ ownerId: "owner_2" }),
      request({ clientId: "client_2" }),
    ]) {
      expect(() =>
        planAgentGrantRevision({
          actor: {
            kind: "owner_ui",
            actorId: revisedRequest.ownerId,
          },
          grant: grant(),
          request: revisedRequest,
          explicitAllResourceKinds: [],
          activeTrustSessionIds: [],
          now,
        }),
      ).toThrow("AGENT_GRANT_REVISION_IDENTITY_MISMATCH");
    }
  });

  it("inherits owner-only request validation", () => {
    expect(() =>
      planAgentGrantRevision({
        actor: { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
        grant: grant(),
        request: request(),
        explicitAllResourceKinds: [],
        activeTrustSessionIds: [],
        now,
      }),
    ).toThrow("AGENT_GRANT_OWNER_REQUIRED");
  });

  it.each(["revoked", "expired"] as const)(
    "rejects terminal grant state %s",
    (status) => {
      expect(() =>
        planAgentGrantRevision({
          actor,
          grant: grant({ status }),
          request: request(),
          explicitAllResourceKinds: [],
          activeTrustSessionIds: [],
          now,
        }),
      ).toThrow("AGENT_GRANT_TERMINAL");
    },
  );

  it("rejects a grant whose configured expiry has already passed", () => {
    expect(() =>
      planAgentGrantRevision({
        actor,
        grant: grant({ expiresAt: "2026-08-05T11:59:59.999Z" }),
        request: request(),
        explicitAllResourceKinds: [],
        activeTrustSessionIds: [],
        now,
      }),
    ).toThrow("AGENT_GRANT_TERMINAL");
  });

  it("rejects malformed or duplicate dependent trust IDs", () => {
    for (const activeTrustSessionIds of [
      [" trust_1"],
      ["trust_1", "trust_1"],
      ["x".repeat(201)],
      Array.from({ length: 10_001 }, (_, index) => `trust_${index}`),
    ]) {
      expect(() =>
        planAgentGrantRevision({
          actor,
          grant: grant(),
          request: request(),
          explicitAllResourceKinds: [],
          activeTrustSessionIds,
          now,
        }),
      ).toThrow("AGENT_GRANT_REVISION_INVALID");
    }
  });

  it("does not retain mutable request collections", () => {
    const mutableRequest = request();
    const capabilities = mutableRequest.capabilities as unknown as string[];
    const selectors = mutableRequest.resourceSelectors.attention_item as unknown as Array<{
      kind: "exact_ids";
      ids: string[];
    }>;
    const plan = planAgentGrantRevision({
      actor,
      grant: grant(),
      request: mutableRequest,
      explicitAllResourceKinds: [],
      activeTrustSessionIds: [],
      now,
    });

    capabilities.push("growth.write");
    selectors[0]!.ids.push("attention_2");

    expect(plan.nextGrant.capabilities).toEqual([
      "attention.write",
      "roadmap.write",
    ]);
    expect(plan.nextGrant.resourceSelectors.attention_item).toEqual([
      { kind: "exact_ids", ids: ["attention_1"] },
    ]);
  });
});
