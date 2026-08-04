import type { CommandContext, ConfirmationOutcome, PolicyDecision, RiskTier } from "./core";
import type { CommandManifest } from "./command-registry";

const outcomeRank: Readonly<Record<ConfirmationOutcome, number>> = {
  allow: 0,
  confirm_in_client: 1,
  prepare_approval: 2,
  approve_in_devos: 3,
  deny: 4,
};

function riskDefault(risk: RiskTier): ConfirmationOutcome {
  switch (risk) {
    case "read":
    case "low":
      return "allow";
    case "medium":
      return "confirm_in_client";
    case "high":
    case "critical":
      return "approve_in_devos";
  }
}

function stricter(
  left: ConfirmationOutcome,
  right: ConfirmationOutcome,
): ConfirmationOutcome {
  return outcomeRank[left] >= outcomeRank[right] ? left : right;
}

function decision(
  outcome: ConfirmationOutcome,
  risk: RiskTier,
  reasonCode: string,
): PolicyDecision {
  return {
    outcome,
    risk,
    reasonCode,
    approvalId: null,
  };
}

export class OwnerBrowserPolicy {
  evaluate(
    manifest: CommandManifest,
    context: CommandContext,
  ): PolicyDecision {
    if (context.actor.kind !== "owner_ui") {
      return decision("deny", manifest.riskFloor, "OWNER_UI_REQUIRED");
    }
    if (context.actor.actorId !== context.ownerId) {
      return decision("deny", manifest.riskFloor, "OWNER_IDENTITY_MISMATCH");
    }

    if (manifest.execution === "registered_blocked") {
      return manifest.riskFloor === "high" || manifest.riskFloor === "critical"
        ? decision(
            "approve_in_devos",
            manifest.riskFloor,
            "APPROVAL_EXECUTOR_NOT_AVAILABLE",
          )
        : decision(
            "deny",
            manifest.riskFloor,
            "COMMAND_EXECUTION_BLOCKED",
          );
    }

    const required = stricter(
      riskDefault(manifest.riskFloor),
      manifest.confirmation,
    );
    if (required === "confirm_in_client") {
      return context.confirmed
        ? decision(
            "allow",
            manifest.riskFloor,
            "CLIENT_CONFIRMATION_ACCEPTED",
          )
        : decision(
            "confirm_in_client",
            manifest.riskFloor,
            "CLIENT_CONFIRMATION_REQUIRED",
          );
    }
    if (required === "allow") {
      return decision("allow", manifest.riskFloor, "OWNER_POLICY_ALLOWED");
    }
    if (required === "prepare_approval") {
      return decision(
        "prepare_approval",
        manifest.riskFloor,
        "APPROVAL_PREPARATION_REQUIRED",
      );
    }
    if (required === "approve_in_devos") {
      return decision(
        "approve_in_devos",
        manifest.riskFloor,
        "DEVOS_APPROVAL_REQUIRED",
      );
    }
    return decision("deny", manifest.riskFloor, "COMMAND_POLICY_DENIED");
  }
}
