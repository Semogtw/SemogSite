import { describe, expect, it } from "vitest";
import { planAgentGrantAvailabilityTransition } from "./grant-availability";
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
    version: 2,
    ...overrides,
  };
}

const actor = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T10:00:00.000Z";

describe("agent grant availability transitions", () => {
  it("plans active-to-suspended without revocation semantics", () => {
    expect(
      planAgentGrantAvailabilityTransition({
        actor,
        grant: grant(),
        targetStatus: "suspended",
        now,
        reason: "Pause the integration during review.",
      }),
    ).toEqual({
      grantId: "grant_1",
      ownerId: "owner_1",
      clientId: "client_1",
      fromStatus: "active",
      toStatus: "suspended",
      expectedVersion: 2,
      nextVersion: 3,
      changedAt: now,
      reason: "Pause the integration during review.",
    });
  });

  it("plans suspended-to-active reactivation", () => {
    expect(
      planAgentGrantAvailabilityTransition({
        actor,
        grant: grant({ status: "suspended" }),
        targetStatus: "active",
        now,
        reason: "Resume after owner review.",
      }),
    ).toMatchObject({
      fromStatus: "suspended",
      toStatus: "active",
      expectedVersion: 2,
      nextVersion: 3,
    });
  });

  it("rejects revocation through the non-cascading path at runtime", () => {
    expect(() =>
      planAgentGrantAvailabilityTransition({
        actor,
        grant: grant(),
        targetStatus: "revoked",
        now,
        reason: "Attempt to bypass cascade planning.",
      } as never),
    ).toThrow("AGENT_GRANT_AVAILABILITY_INVALID");
  });

  it("inherits owner, state and optimistic-version protections", () => {
    expect(() =>
      planAgentGrantAvailabilityTransition({
        actor: { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
        grant: grant(),
        targetStatus: "suspended",
        now,
        reason: "Self-suspension attempt.",
      }),
    ).toThrow("AGENT_GRANT_OWNER_REQUIRED");

    expect(() =>
      planAgentGrantAvailabilityTransition({
        actor,
        grant: grant({ version: Number.MAX_SAFE_INTEGER }),
        targetStatus: "suspended",
        now,
        reason: "Unsafe version transition.",
      }),
    ).toThrow("AGENT_GRANT_TRANSITION_INVALID");
  });
});
