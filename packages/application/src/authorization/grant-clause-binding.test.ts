import { describe, expect, it } from "vitest";
import { computeEffectiveAgentAuthorization } from "./effective-grant";
import { decideAgentCommandDisposition } from "./policy-engine";
import { validateTrustSessionRequest } from "./trust-session";
import type { AgentGrantDefinition } from "./types";

function grant(input: {
  id: string;
  attentionId: string;
  riskCeiling: "low" | "medium" | "high";
}): AgentGrantDefinition {
  return {
    id: input.id,
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: null,
    status: "active",
    capabilities: ["attention.write"],
    resourceSelectors: {
      attention_item: [
        { kind: "exact_ids", ids: [input.attentionId] },
      ],
    },
    riskCeiling: input.riskCeiling,
    expiresAt: null,
    version: 1,
  };
}

const switches = {
  globalEnabled: true,
  clientEnabled: true,
  domainEnabled: true,
};

describe("grant clause risk/resource binding", () => {
  it("preserves one clause per contributing grant", () => {
    const authorization = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: ["devos.write.attention"],
      grants: [
        grant({ id: "grant_high", attentionId: "attention_1", riskCeiling: "high" }),
        grant({ id: "grant_low", attentionId: "attention_2", riskCeiling: "low" }),
      ],
      trustSessions: [],
      now: "2026-08-04T20:00:00.000Z",
    });

    expect(authorization?.authorizationClauses).toEqual([
      {
        grantId: "grant_high",
        capability: "attention.write",
        resourceSelectors: {
          attention_item: [
            { kind: "exact_ids", ids: ["attention_1"] },
          ],
        },
        riskCeiling: "high",
      },
      {
        grantId: "grant_low",
        capability: "attention.write",
        resourceSelectors: {
          attention_item: [
            { kind: "exact_ids", ids: ["attention_2"] },
          ],
        },
        riskCeiling: "low",
      },
    ]);
  });

  it("does not authorize medium risk by combining the high ceiling with another selector", () => {
    const authorization = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: ["devos.write.attention"],
      grants: [
        grant({ id: "grant_high", attentionId: "attention_1", riskCeiling: "high" }),
        grant({ id: "grant_low", attentionId: "attention_2", riskCeiling: "low" }),
      ],
      trustSessions: [],
      now: "2026-08-04T20:00:00.000Z",
    });
    expect(authorization).not.toBeNull();

    expect(
      decideAgentCommandDisposition({
        authorization,
        command: {
          capability: "attention.write",
          domain: "attention",
          risk: "medium",
          confirmation: "confirm_in_client",
          resource: {
            kind: "attention_item",
            id: "attention_2",
            parentRefs: [],
            lifecycleState: "open",
          },
        },
        writeSwitches: switches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "RISK_CEILING_EXCEEDED",
    });
  });

  it("does not create medium trust for a resource covered only by a low clause", () => {
    const authorization = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: ["devos.write.attention"],
      grants: [
        grant({ id: "grant_medium", attentionId: "attention_1", riskCeiling: "medium" }),
        grant({ id: "grant_low", attentionId: "attention_2", riskCeiling: "low" }),
      ],
      trustSessions: [],
      now: "2026-08-04T20:00:00.000Z",
    });
    expect(authorization).not.toBeNull();

    expect(() =>
      validateTrustSessionRequest({
        durationMinutes: 120,
        maxOperations: 25,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: {
          attention_item: [
            { kind: "exact_ids", ids: ["attention_2"] },
          ],
        },
        baseAuthorization: authorization!,
      }),
    ).toThrow("TRUST_RESOURCE_NOT_GRANTED");
  });
});
