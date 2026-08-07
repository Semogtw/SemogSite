import { describe, expect, it } from "vitest";
import { decideAgentCommandDisposition } from "./policy-engine";
import type { EffectiveAgentAuthorization } from "./types";

const resourceSelectors = {
  attention_item: [{ kind: "exact_ids" as const, ids: ["attention_1"] }],
};

const authorization: EffectiveAgentAuthorization = {
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

const base = {
  authorization,
  writeSwitches: {
    globalEnabled: true,
    clientEnabled: true,
    domainEnabled: true,
  },
  trustCoversCommand: true,
  confirmationValid: true,
};

function command(confirmation: string, risk: "low" | "medium" = "medium") {
  return {
    capability: "attention.write" as const,
    domain: "attention",
    risk,
    confirmation: confirmation as never,
    resource: {
      kind: "attention_item",
      id: "attention_1",
      parentRefs: [] as const,
      lifecycleState: "open",
    },
  };
}

describe("static command confirmation floors", () => {
  it("never lowers deny", () => {
    expect(
      decideAgentCommandDisposition({ ...base, command: command("deny") }),
    ).toMatchObject({ outcome: "deny", reasonCode: "COMMAND_POLICY_DENIED" });
  });

  it("never lowers DevOS approval", () => {
    expect(
      decideAgentCommandDisposition({
        ...base,
        command: command("approve_in_devos"),
      }),
    ).toMatchObject({
      outcome: "approve_in_devos",
      reasonCode: "DEVOS_APPROVAL_REQUIRED",
    });
  });

  it("never lowers approval preparation", () => {
    expect(
      decideAgentCommandDisposition({
        ...base,
        command: command("prepare_approval"),
      }),
    ).toMatchObject({
      outcome: "prepare_approval",
      reasonCode: "OWNER_APPROVAL_PREPARATION_REQUIRED",
    });
  });

  it("keeps explicit confirmation on a low-risk command", () => {
    expect(
      decideAgentCommandDisposition({
        ...base,
        trustCoversCommand: false,
        confirmationValid: false,
        command: command("confirm_in_client", "low"),
      }),
    ).toMatchObject({
      outcome: "confirm_in_client",
      reasonCode: "CLIENT_CONFIRMATION_REQUIRED",
    });
  });

  it("fails closed for a malformed static confirmation", () => {
    expect(
      decideAgentCommandDisposition({
        ...base,
        command: command("client_says_allow"),
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "COMMAND_POLICY_INPUT_INVALID",
    });
  });
});
