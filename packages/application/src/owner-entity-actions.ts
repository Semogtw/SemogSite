import type { CommandRegistry } from "./command-registry";
import type { CommandContext, RiskTier } from "./core";
import catalogJson from "./editability-catalog.json";
import type { EditabilityManifest } from "./editability-manifest";
import type { OwnerBrowserPolicy } from "./owner-browser-policy";

export type OwnerEntityActionAvailability =
  | "available"
  | "confirmation_required"
  | "approval_required"
  | "planned";

export type OwnerEntityAction = {
  commandId: string;
  labelPtBr: string;
  risk: RiskTier;
  reversible: boolean;
  availability: OwnerEntityActionAvailability;
};

type CatalogCommandLabel = {
  commandId: string;
  labelPtBr: string;
};

const commandLabels = new Map(
  (catalogJson.commands as readonly CatalogCommandLabel[]).map((command) => [
    command.commandId,
    command.labelPtBr,
  ]),
);

function availableFromDecision(
  outcome: ReturnType<OwnerBrowserPolicy["evaluate"]>["outcome"],
): OwnerEntityActionAvailability | null {
  switch (outcome) {
    case "allow":
      return "available";
    case "confirm_in_client":
      return "confirmation_required";
    case "prepare_approval":
    case "approve_in_devos":
      return "approval_required";
    case "deny":
      return null;
  }
}

export function listOwnerEntityActions(input: {
  registry: CommandRegistry;
  manifests: readonly EditabilityManifest[];
  policy: OwnerBrowserPolicy;
  resourceType: string;
  resourceId: string;
  context: CommandContext;
}): readonly OwnerEntityAction[] {
  if (
    input.resourceType.trim() !== input.resourceType ||
    input.resourceType.length < 1 ||
    input.resourceType.length > 120 ||
    input.resourceId.trim() !== input.resourceId ||
    input.resourceId.length < 1 ||
    input.resourceId.length > 200
  ) {
    return [];
  }

  const manifestedCommands = new Set(
    input.manifests.flatMap((manifest) => manifest.commands),
  );
  const actions: OwnerEntityAction[] = [];
  for (const command of input.registry.listManifests()) {
    if (
      command.resourceType !== input.resourceType ||
      !manifestedCommands.has(command.commandId)
    ) {
      continue;
    }

    const decision = input.policy.evaluate(command, input.context);
    const availability =
      command.execution === "registered_blocked"
        ? decision.outcome === "deny"
          ? null
          : "planned"
        : availableFromDecision(decision.outcome);
    if (availability === null) continue;

    const labelPtBr = commandLabels.get(command.commandId);
    if (
      labelPtBr === undefined ||
      labelPtBr.trim() !== labelPtBr ||
      labelPtBr.length < 1 ||
      labelPtBr.length > 120
    ) {
      continue;
    }
    actions.push({
      commandId: command.commandId,
      labelPtBr,
      risk: command.riskFloor,
      reversible: command.undoStrategy !== "none",
      availability,
    });
  }

  return actions.sort((left, right) =>
    left.commandId < right.commandId
      ? -1
      : left.commandId > right.commandId
        ? 1
        : 0,
  );
}
