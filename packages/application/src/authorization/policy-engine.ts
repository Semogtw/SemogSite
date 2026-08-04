import type {
  ConfirmationOutcome,
  PolicyDecision,
} from "../core";
import { isAgentCapability } from "./capabilities";
import { selectorMatchesResource } from "./resource-selectors";
import type {
  AgentCapability,
  AgentRiskCeiling,
  CommandResource,
  EffectiveAgentAuthorization,
} from "./types";
import {
  writesAllowed,
  type AgentWriteSwitchState,
} from "./write-switches";

export type AgentCommandRisk = "low" | "medium" | "high" | "critical";
export type AgentCommandPolicyDecision = PolicyDecision;

const riskRank: Readonly<Record<AgentRiskCeiling, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

const confirmationRank: Readonly<Record<ConfirmationOutcome, number>> = {
  allow: 0,
  confirm_in_client: 1,
  prepare_approval: 2,
  approve_in_devos: 3,
  deny: 4,
};

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function commandRiskValid(value: string): value is AgentCommandRisk {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  );
}

function riskCeilingValid(value: unknown): value is AgentRiskCeiling {
  return value === "low" || value === "medium" || value === "high";
}

function confirmationValid(value: unknown): value is ConfirmationOutcome {
  return (
    value === "allow" ||
    value === "confirm_in_client" ||
    value === "prepare_approval" ||
    value === "approve_in_devos" ||
    value === "deny"
  );
}

function riskDefault(risk: AgentCommandRisk): ConfirmationOutcome {
  switch (risk) {
    case "low":
      return "allow";
    case "medium":
      return "confirm_in_client";
    case "high":
      return "prepare_approval";
    case "critical":
      return "approve_in_devos";
  }
}

function stricterConfirmation(
  left: ConfirmationOutcome,
  right: ConfirmationOutcome,
): ConfirmationOutcome {
  return confirmationRank[left] >= confirmationRank[right] ? left : right;
}

function decision(input: {
  outcome: PolicyDecision["outcome"];
  risk: AgentCommandRisk;
  reasonCode: string;
}): AgentCommandPolicyDecision {
  return {
    outcome: input.outcome,
    risk: input.risk,
    reasonCode: input.reasonCode,
    approvalId: null,
  };
}

function deny(
  risk: AgentCommandRisk,
  reasonCode: string,
): AgentCommandPolicyDecision {
  return decision({ outcome: "deny", risk, reasonCode });
}

function requiredCeilingForRisk(
  risk: AgentCommandRisk,
): AgentRiskCeiling {
  return risk === "critical" ? "high" : risk;
}

function resourceAuthorized(input: {
  authorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
  resource: CommandResource;
}): boolean {
  try {
    const selectorsByKind =
      input.authorization.capabilityResourceSelectors?.[input.capability];
    const selectors = selectorsByKind?.[input.resource.kind];
    return (
      Array.isArray(selectors) &&
      selectors.length > 0 &&
      selectors.some((selector) =>
        selectorMatchesResource({ selector, resource: input.resource }),
      )
    );
  } catch {
    return false;
  }
}

export function decideAgentCommandDisposition(input: {
  authorization: EffectiveAgentAuthorization | null;
  command: {
    capability: AgentCapability;
    domain: string;
    risk: AgentCommandRisk;
    confirmation?: ConfirmationOutcome;
    resource: CommandResource;
  };
  writeSwitches: AgentWriteSwitchState;
  trustCoversCommand: boolean;
  confirmationValid: boolean;
}): AgentCommandPolicyDecision {
  const runtimeRisk = input.command?.risk as string;
  const safeRisk: AgentCommandRisk = commandRiskValid(runtimeRisk)
    ? runtimeRisk
    : "low";

  if (
    typeof input.authorization !== "object" ||
    input.authorization === null
  ) {
    return deny(safeRisk, "NO_EFFECTIVE_GRANT");
  }

  if (!writesAllowed(input.writeSwitches)) {
    return deny(safeRisk, "REMOTE_WRITES_DISABLED");
  }

  const runtimeCapability = input.command?.capability as string;
  if (
    !isAgentCapability(runtimeCapability) ||
    !Array.isArray(input.authorization.capabilities) ||
    !input.authorization.capabilities.includes(runtimeCapability)
  ) {
    return deny(safeRisk, "CAPABILITY_DENIED");
  }

  const staticConfirmation = input.command.confirmation;
  if (
    !commandRiskValid(runtimeRisk) ||
    !bounded(input.command.domain, 120) ||
    typeof input.command.resource !== "object" ||
    input.command.resource === null ||
    (staticConfirmation !== undefined &&
      !confirmationValid(staticConfirmation))
  ) {
    return deny(safeRisk, "COMMAND_POLICY_INPUT_INVALID");
  }

  if (
    !resourceAuthorized({
      authorization: input.authorization,
      capability: runtimeCapability,
      resource: input.command.resource,
    })
  ) {
    return deny(runtimeRisk, "RESOURCE_DENIED");
  }

  const riskCeiling =
    input.authorization.riskCeilingByCapability?.[runtimeCapability];
  const requiredCeiling = requiredCeilingForRisk(runtimeRisk);
  if (
    !riskCeilingValid(riskCeiling) ||
    riskRank[riskCeiling] < riskRank[requiredCeiling]
  ) {
    return deny(runtimeRisk, "RISK_CEILING_EXCEEDED");
  }

  const requiredConfirmation = stricterConfirmation(
    riskDefault(runtimeRisk),
    staticConfirmation ?? "allow",
  );

  if (requiredConfirmation === "deny") {
    return deny(runtimeRisk, "COMMAND_POLICY_DENIED");
  }
  if (requiredConfirmation === "approve_in_devos") {
    return decision({
      outcome: "approve_in_devos",
      risk: runtimeRisk,
      reasonCode: "DEVOS_APPROVAL_REQUIRED",
    });
  }
  if (requiredConfirmation === "prepare_approval") {
    return decision({
      outcome: "prepare_approval",
      risk: runtimeRisk,
      reasonCode: "OWNER_APPROVAL_PREPARATION_REQUIRED",
    });
  }
  if (requiredConfirmation === "confirm_in_client") {
    if (input.trustCoversCommand === true) {
      return decision({
        outcome: "allow",
        risk: runtimeRisk,
        reasonCode: "TRUST_SESSION_ACCEPTED",
      });
    }
    if (input.confirmationValid === true) {
      return decision({
        outcome: "allow",
        risk: runtimeRisk,
        reasonCode: "CONFIRMATION_CHALLENGE_ACCEPTED",
      });
    }
    return decision({
      outcome: "confirm_in_client",
      risk: runtimeRisk,
      reasonCode: "CLIENT_CONFIRMATION_REQUIRED",
    });
  }

  return decision({
    outcome: "allow",
    risk: runtimeRisk,
    reasonCode: "LOW_RISK_ALLOWED",
  });
}
