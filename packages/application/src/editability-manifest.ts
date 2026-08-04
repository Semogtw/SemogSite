import type { CommandRegistry } from "./command-registry";
import type {
  ConflictStrategy,
  RiskTier,
  UndoStrategy,
} from "./core";
import catalogJson from "./editability-catalog.json";

export type EditabilityMcpExposure =
  | "direct"
  | "change_set_only"
  | "control_plane"
  | "not_yet";

export type EditabilityImplementationState = "planned" | "partial" | "complete";

export type EditabilityManifest = {
  featureId: string;
  reads: readonly string[];
  commands: readonly string[];
  uiRoutes: readonly string[];
  mcpExposure: EditabilityMcpExposure;
  riskSummary: Readonly<Record<string, RiskTier>>;
  undoStrategy: UndoStrategy;
  conflictStrategy: ConflictStrategy | null;
  auditEvents: readonly string[];
  implementationState: EditabilityImplementationState;
};

type CatalogManifest = EditabilityManifest & {
  uiRouteFiles: readonly string[];
};

export type EditabilityCoverageErrorCode =
  | "DUPLICATE_FEATURE_ID"
  | "UNKNOWN_COMMAND_ID"
  | "COMMAND_WITHOUT_MANIFEST"
  | "UI_ROUTE_MISSING"
  | "RISK_SUMMARY_MISMATCH"
  | "CONFLICT_STRATEGY_MISSING"
  | "AUDIT_EVENT_MISSING"
  | "CRITICAL_WITHOUT_APPROVAL_PATH"
  | "COMPLETE_FEATURE_WITH_NOT_YET_MCP_STRATEGY";

export type EditabilityCoverageError = {
  code: EditabilityCoverageErrorCode;
  featureId: string | null;
  commandId: string | null;
};

const catalogManifests = catalogJson.manifests as unknown as readonly CatalogManifest[];

function manifestById(featureId: string): CatalogManifest {
  const manifest = catalogManifests.find(
    (candidate) => candidate.featureId === featureId,
  );
  if (manifest === undefined) {
    throw new Error(`EDITABILITY_MANIFEST_MISSING:${featureId}`);
  }
  return manifest;
}

export const attentionLifecycleManifest = manifestById(
  "attention-lifecycle",
);
export const roadmapStageCompletionManifest = manifestById(
  "roadmap-stage-completion",
);
export const editabilityManifests: readonly EditabilityManifest[] =
  catalogManifests;

function error(
  code: EditabilityCoverageErrorCode,
  featureId: string | null,
  commandId: string | null,
): EditabilityCoverageError {
  return { code, featureId, commandId };
}

export function validateEditabilityCoverage(input: {
  registry: CommandRegistry;
  manifests: readonly EditabilityManifest[];
}): readonly EditabilityCoverageError[] {
  const errors: EditabilityCoverageError[] = [];
  const commandMetadata = input.registry.listManifests();
  const commandsById = new Map(
    commandMetadata.map((command) => [command.commandId, command]),
  );
  const featureIds = new Set<string>();
  const coveredCommands = new Set<string>();

  for (const manifest of input.manifests) {
    if (featureIds.has(manifest.featureId)) {
      errors.push(error("DUPLICATE_FEATURE_ID", manifest.featureId, null));
    }
    featureIds.add(manifest.featureId);

    if (manifest.uiRoutes.length === 0) {
      errors.push(error("UI_ROUTE_MISSING", manifest.featureId, null));
    }
    if (manifest.conflictStrategy === null) {
      errors.push(error("CONFLICT_STRATEGY_MISSING", manifest.featureId, null));
    }
    if (manifest.auditEvents.length === 0) {
      errors.push(error("AUDIT_EVENT_MISSING", manifest.featureId, null));
    }
    if (
      manifest.implementationState === "complete" &&
      manifest.mcpExposure === "not_yet"
    ) {
      errors.push(
        error(
          "COMPLETE_FEATURE_WITH_NOT_YET_MCP_STRATEGY",
          manifest.featureId,
          null,
        ),
      );
    }

    for (const commandId of manifest.commands) {
      coveredCommands.add(commandId);
      const command = commandsById.get(commandId);
      if (command === undefined) {
        errors.push(error("UNKNOWN_COMMAND_ID", manifest.featureId, commandId));
        continue;
      }
      if (manifest.riskSummary[commandId] !== command.riskFloor) {
        errors.push(
          error("RISK_SUMMARY_MISMATCH", manifest.featureId, commandId),
        );
      }
      if (
        (command.riskFloor === "high" || command.riskFloor === "critical") &&
        command.confirmation !== "prepare_approval" &&
        command.confirmation !== "approve_in_devos"
      ) {
        errors.push(
          error(
            "CRITICAL_WITHOUT_APPROVAL_PATH",
            manifest.featureId,
            commandId,
          ),
        );
      }
    }
  }

  for (const command of commandMetadata) {
    if (!coveredCommands.has(command.commandId)) {
      errors.push(error("COMMAND_WITHOUT_MANIFEST", null, command.commandId));
    }
  }

  return errors;
}
