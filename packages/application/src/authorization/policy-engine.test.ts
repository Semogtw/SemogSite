import { describe, expect, it } from "vitest";
import { decideAgentCommandDisposition } from "./policy-engine";
import type {
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
} from "./types";
import type { AgentWriteSwitchState } from "./write-switches";

const enabledSwitches: AgentWriteSwitchState = {
  globalEnabled: true,
  clientEnabled: true,
  domainEnabled: true,
};

function authorization(input: {
  capability?: "attention.write" | "roadmap.write";
  resourceSelectors?: ResourceSelectorMap;
  riskCeiling?: "low" | "medium" | "high";
} = {}): EffectiveAgentAuthorization {
  const capability = input.capability ?? "attention.write";
  const resourceSelectors = input.resourceSelectors ?? {
    attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
  };
  const riskCeiling = input.riskCeiling ?? "medium";
  return {
    clientId: "client_1",
    ownerId: "owner_1",
    capabilities: [capability],
    resourceSelectors,
    capabilityResourceSelectors: { [capability]: resourceSelectors },
    riskCeiling,
    riskCeilingByCapability: { [capability]: riskCeiling },
    grantIds: ["grant_1"],
    trustSessionIds: [],
  };
}

function command(
  overrides: Partial<{
    capability: "attention.write" | "roadmap.write";
    domain: string;
    risk: "low" | "medium" | "high" | "critical";
    resource: {
      kind: string;
      id: string;
      parentRefs: readonly [];
      lifecycleState: string | null;
    };
  }> = {},
) {
  return {
    capability: "attention.write" as const,
    domain: "attention",
    risk: "medium" as const,
    resource: {
      kind: "attention_item",
      id: "attention_1",
      parentRefs: [] as const,
      lifecycleState: "open",
    },
    ...overrides,
  };
}

describe("agent command policy decision order", () => {
  it("denies without effective authorization before any later condition", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: null,
        command: command(),
        writeSwitches: {
          globalEnabled: false,
          clientEnabled: false,
          domainEnabled: false,
        },
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toEqual({
      outcome: "deny",
      risk: "medium",
      reasonCode: "NO_EFFECTIVE_GRANT",
      approvalId: null,
    });
  });

  it("lets kill switches override grants, trust and challenge confirmation", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization(),
        command: command(),
        writeSwitches: {
          globalEnabled: true,
          clientEnabled: false,
          domainEnabled: true,
        },
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "REMOTE_WRITES_DISABLED",
    });
  });

  it("denies an absent capability before checking resource or confirmation", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization({
          capability: "roadmap.write",
          resourceSelectors: {
            stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
          },
          riskCeiling: "high",
        }),
        command: command(),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "CAPABILITY_DENIED" });
  });

  it("denies a resource outside the selectors for that exact capability", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization(),
        command: command({
          resource: {
            kind: "attention_item",
            id: "attention_2",
            parentRefs: [],
            lifecycleState: "open",
          },
        }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "RESOURCE_DENIED" });
  });

  it("does not use another capability's selector to authorize the resource", () => {
    const mixed: EffectiveAgentAuthorization = {
      ...authorization(),
      capabilities: ["attention.write", "roadmap.write"],
      capabilityResourceSelectors: {
        "attention.write": {
          attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
        },
        "roadmap.write": {
          stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
        },
      },
      riskCeiling: "high",
      riskCeilingByCapability: {
        "attention.write": "medium",
        "roadmap.write": "high",
      },
    };
    expect(
      decideAgentCommandDisposition({
        authorization: mixed,
        command: command({
          capability: "roadmap.write",
          risk: "high",
          resource: {
            kind: "attention_item",
            id: "attention_1",
            parentRefs: [],
            lifecycleState: "open",
          },
        }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "RESOURCE_DENIED" });
  });

  it("denies risk above the capability-specific ceiling", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization({ riskCeiling: "low" }),
        command: command({ risk: "medium" }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "RISK_CEILING_EXCEEDED",
    });
  });

  it("requires a high ceiling before a critical command can request DevOS approval", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization({ riskCeiling: "medium" }),
        command: command({ risk: "critical" }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "RISK_CEILING_EXCEEDED",
    });

    expect(
      decideAgentCommandDisposition({
        authorization: authorization({ riskCeiling: "high" }),
        command: command({ risk: "critical" }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toEqual({
      outcome: "approve_in_devos",
      risk: "critical",
      reasonCode: "DEVOS_APPROVAL_REQUIRED",
      approvalId: null,
    });
  });

  it("always prepares owner approval for high risk", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization({ riskCeiling: "high" }),
        command: command({ risk: "high" }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toEqual({
      outcome: "prepare_approval",
      risk: "high",
      reasonCode: "OWNER_APPROVAL_PREPARATION_REQUIRED",
      approvalId: null,
    });
  });

  it("allows medium risk through matching trust before challenge confirmation", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization(),
        command: command(),
        writeSwitches: enabledSwitches,
        trustCoversCommand: true,
        confirmationValid: true,
      }),
    ).toMatchObject({ outcome: "allow", reasonCode: "TRUST_SESSION_ACCEPTED" });
  });

  it("allows medium risk through a valid challenge when trust is absent", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization(),
        command: command(),
        writeSwitches: enabledSwitches,
        trustCoversCommand: false,
        confirmationValid: true,
      }),
    ).toMatchObject({
      outcome: "allow",
      reasonCode: "CONFIRMATION_CHALLENGE_ACCEPTED",
    });
  });

  it("requires client confirmation for medium risk without trust or challenge", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization(),
        command: command(),
        writeSwitches: enabledSwitches,
        trustCoversCommand: false,
        confirmationValid: false,
      }),
    ).toEqual({
      outcome: "confirm_in_client",
      risk: "medium",
      reasonCode: "CLIENT_CONFIRMATION_REQUIRED",
      approvalId: null,
    });
  });

  it("allows low risk after all authorization layers pass", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization({ riskCeiling: "low" }),
        command: command({ risk: "low" }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: false,
        confirmationValid: false,
      }),
    ).toEqual({
      outcome: "allow",
      risk: "low",
      reasonCode: "LOW_RISK_ALLOWED",
      approvalId: null,
    });
  });

  it("fails closed for a malformed runtime risk", () => {
    expect(
      decideAgentCommandDisposition({
        authorization: authorization(),
        command: command({ risk: "read" as never }),
        writeSwitches: enabledSwitches,
        trustCoversCommand: false,
        confirmationValid: false,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "COMMAND_POLICY_INPUT_INVALID" });
  });
});
