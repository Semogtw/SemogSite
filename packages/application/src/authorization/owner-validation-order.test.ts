import { describe, expect, it } from "vitest";
import { planAgentGrantStatusTransition } from "./grant-lifecycle";
import { planAgentTrustSessionCreation } from "./trust-session-request";
import type {
  AgentGrantDefinition,
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
} from "./types";

const selectors: ResourceSelectorMap = {
  attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
};
const owner = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T07:00:00.000Z";

const grant: AgentGrantDefinition = {
  id: "grant_1",
  ownerId: " owner_1",
  clientId: "client_1",
  profileId: null,
  status: "active",
  capabilities: ["attention.write"],
  resourceSelectors: selectors,
  riskCeiling: "medium",
  expiresAt: null,
  version: 1,
};

const authorization: EffectiveAgentAuthorization = {
  clientId: "client_1",
  ownerId: " owner_1",
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

describe("owner authorization validation order", () => {
  it("rejects malformed grant state before checking owner equality", () => {
    expect(() =>
      planAgentGrantStatusTransition({
        actor: owner,
        grant,
        targetStatus: "suspended",
        now,
        reason: "Pause access.",
      }),
    ).toThrow("AGENT_GRANT_TRANSITION_INVALID");
  });

  it("rejects malformed base authorization before checking owner equality", () => {
    expect(() =>
      planAgentTrustSessionCreation({
        actor: owner,
        trustSessionId: "trust_1",
        baseAuthorization: authorization,
        durationMinutes: 60,
        maxOperations: 10,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: selectors,
        now,
        reason: "Supervised work window.",
      }),
    ).toThrow("TRUST_SESSION_REQUEST_INVALID");
  });
});
