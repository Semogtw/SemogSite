import { describe, expect, it } from "vitest";
import { planAgentTrustSessionCreation } from "./trust-session-request";
import type {
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
} from "./types";

const baseAuthorization: EffectiveAgentAuthorization = {
  clientId: "client_1",
  ownerId: "owner_1",
  capabilities: ["attention.write"],
  resourceSelectors: {
    attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
  },
  capabilityResourceSelectors: {
    "attention.write": {
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    },
  },
  riskCeiling: "medium",
  riskCeilingByCapability: { "attention.write": "medium" },
  authorizationClauses: [
    {
      grantId: "grant_1",
      capability: "attention.write",
      resourceSelectors: {
        attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
      },
      riskCeiling: "medium",
    },
  ],
  grantIds: ["grant_1"],
  trustSessionIds: [],
};

describe("trust session creation copy safety", () => {
  it("does not retain mutable requested resource collections", () => {
    const requestedResources: ResourceSelectorMap = {
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    };
    const plan = planAgentTrustSessionCreation({
      actor: { kind: "owner_ui", actorId: "owner_1" },
      trustSessionId: "trust_1",
      baseAuthorization,
      durationMinutes: 60,
      maxOperations: 10,
      riskCeiling: "medium",
      requestedCapabilities: ["attention.write"],
      requestedResources,
      now: "2026-08-05T09:30:00.000Z",
      reason: "Supervised attention maintenance.",
    });

    const mutableSelectors = requestedResources.attention_item as unknown as Array<{
      kind: "exact_ids";
      ids: string[];
    }>;
    mutableSelectors[0]!.ids.push("attention_2");
    mutableSelectors.push({ kind: "exact_ids", ids: ["attention_3"] });

    expect(plan.resourceSelectors.attention_item).toEqual([
      { kind: "exact_ids", ids: ["attention_1"] },
    ]);
  });
});
