import { describe, expect, it } from "vitest";
import { decideAgentCommandDisposition } from "./policy-engine";
import type { EffectiveAgentAuthorization } from "./types";

const command = {
  capability: "attention.write" as const,
  domain: "attention",
  risk: "medium" as const,
  resource: {
    kind: "attention_item",
    id: "attention_1",
    parentRefs: [] as const,
    lifecycleState: "open",
  },
};

const switches = {
  globalEnabled: true,
  clientEnabled: true,
  domainEnabled: true,
};

function authorization(): EffectiveAgentAuthorization {
  const resourceSelectors = {
    attention_item: [{ kind: "exact_ids" as const, ids: ["attention_1"] }],
  };
  return {
    clientId: "client_1",
    ownerId: "owner_1",
    capabilities: ["attention.write"],
    resourceSelectors,
    capabilityResourceSelectors: {
      "attention.write": resourceSelectors,
    },
    riskCeiling: "medium",
    riskCeilingByCapability: { "attention.write": "medium" },
    authorizationClauses: [
      {
        grantId: "grant_1",
        capability: "attention.write",
        resourceSelectors,
        riskCeiling: "medium",
      },
    ],
    grantIds: ["grant_1"],
    trustSessionIds: [],
  };
}

describe("agent command policy integrity", () => {
  it("treats an undefined runtime authorization as no grant", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: undefined as never,
        command,
        writeSwitches: switches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "NO_EFFECTIVE_GRANT" });
  });

  it("denies a malformed clause risk ceiling even when aggregates look valid", () => {
    const malformed = authorization();
    malformed.authorizationClauses = [
      {
        ...malformed.authorizationClauses[0]!,
        riskCeiling: "critical" as never,
      },
    ];
    expect(
      decideAgentCommandDisposition({
        authorization: malformed,
        command,
        writeSwitches: switches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "RESOURCE_DENIED",
    });
  });

  it("denies malformed clause selector storage without throwing", () => {
    const malformed = authorization();
    malformed.authorizationClauses = [
      {
        ...malformed.authorizationClauses[0]!,
        resourceSelectors: { attention_item: "all" as never },
      },
    ];
    expect(
      decideAgentCommandDisposition({
        authorization: malformed,
        command,
        writeSwitches: switches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "RESOURCE_DENIED" });
  });

  it("ignores a permissive aggregate when no clause exists", () => {
    const malformed = authorization();
    malformed.authorizationClauses = [];
    expect(
      decideAgentCommandDisposition({
        authorization: malformed,
        command,
        writeSwitches: switches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "RESOURCE_DENIED" });
  });
});
