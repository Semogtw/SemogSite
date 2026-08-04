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
  return {
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

  it("denies a malformed capability-specific risk ceiling", () => {
    const malformed = authorization();
    malformed.riskCeilingByCapability = {
      "attention.write": "critical" as never,
    };
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
      reasonCode: "RISK_CEILING_EXCEEDED",
    });
  });

  it("denies malformed selector storage without throwing", () => {
    const malformed = authorization();
    malformed.capabilityResourceSelectors = {
      "attention.write": { attention_item: "all" as never },
    };
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
