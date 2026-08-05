import { describe, expect, it } from "vitest";
import { planAgentGrantCreation } from "./grant-creation";
import type { AgentGrantRequest } from "./grant-request";

function request(): AgentGrantRequest {
  return {
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: "profile_1",
    capabilities: ["roadmap.write", "attention.write"],
    resourceSelectors: {
      roadmap_stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    },
    riskCeiling: "medium",
    expiresAt: "2026-08-06T08:30:00.000Z",
    reason: "Allow supervised project maintenance.",
  };
}

const actor = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T08:30:00.000Z";

describe("agent grant creation planning", () => {
  it("creates an active version-one grant with audit context", () => {
    expect(
      planAgentGrantCreation({
        actor,
        grantId: "grant_1",
        request: request(),
        explicitAllResourceKinds: [],
        now,
      }),
    ).toEqual({
      grant: {
        id: "grant_1",
        ownerId: "owner_1",
        clientId: "client_1",
        profileId: "profile_1",
        status: "active",
        capabilities: ["attention.write", "roadmap.write"],
        resourceSelectors: {
          attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
          roadmap_stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
        },
        riskCeiling: "medium",
        expiresAt: "2026-08-06T08:30:00.000Z",
        version: 1,
      },
      createdAt: now,
      reason: "Allow supervised project maintenance.",
    });
  });

  it("inherits owner-only request validation", () => {
    expect(() =>
      planAgentGrantCreation({
        actor: { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
        grantId: "grant_1",
        request: request(),
        explicitAllResourceKinds: [],
        now,
      }),
    ).toThrow("AGENT_GRANT_OWNER_REQUIRED");
  });

  it.each(["", " grant_1", "grant_1 ", "x".repeat(201)])(
    "rejects malformed generated grant id %j",
    (grantId) => {
      expect(() =>
        planAgentGrantCreation({
          actor,
          grantId,
          request: request(),
          explicitAllResourceKinds: [],
          now,
        }),
      ).toThrow("AGENT_GRANT_CREATION_INVALID");
    },
  );

  it("does not retain mutable request collections", () => {
    const mutableRequest = request();
    const capabilities = mutableRequest.capabilities as string[];
    const selectors = mutableRequest.resourceSelectors.attention_item as Array<{
      kind: "exact_ids";
      ids: string[];
    }>;
    const plan = planAgentGrantCreation({
      actor,
      grantId: "grant_1",
      request: mutableRequest,
      explicitAllResourceKinds: [],
      now,
    });

    capabilities.push("growth.write");
    selectors[0]!.ids.push("attention_2");

    expect(plan.grant.capabilities).toEqual([
      "attention.write",
      "roadmap.write",
    ]);
    expect(plan.grant.resourceSelectors.attention_item).toEqual([
      { kind: "exact_ids", ids: ["attention_1"] },
    ]);
  });
});
