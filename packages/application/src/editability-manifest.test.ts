import { describe, expect, it } from "vitest";
import { transitionAttentionCommand } from "./attention/transition-attention-command";
import { CommandRegistry } from "./command-registry";
import {
  attentionLifecycleManifest,
  roadmapStageCompletionManifest,
  validateEditabilityCoverage,
  type EditabilityManifest,
} from "./editability-manifest";
import { completeStageCommand } from "./roadmap/complete-stage-command";

const registry = new CommandRegistry([
  transitionAttentionCommand,
  completeStageCommand,
]);

describe("editability manifests", () => {
  it("covers every registered command with coherent safety metadata", () => {
    expect(
      validateEditabilityCoverage({
        registry,
        manifests: [attentionLifecycleManifest, roadmapStageCompletionManifest],
      }),
    ).toEqual([]);
  });

  it("detects duplicate features, unknown commands and uncovered commands", () => {
    const duplicate: EditabilityManifest = {
      ...attentionLifecycleManifest,
      commands: ["unknown.command"],
      riskSummary: { "unknown.command": "low" },
    };

    expect(
      validateEditabilityCoverage({
        registry,
        manifests: [attentionLifecycleManifest, duplicate],
      }).map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        "DUPLICATE_FEATURE_ID",
        "UNKNOWN_COMMAND_ID",
        "COMMAND_WITHOUT_MANIFEST",
      ]),
    );
  });

  it("detects risk mismatch and unsafe completion claims", () => {
    const unsafe: EditabilityManifest = {
      ...roadmapStageCompletionManifest,
      implementationState: "complete",
      mcpExposure: "not_yet",
      riskSummary: { "roadmap.stages.complete": "medium" },
    };

    expect(
      validateEditabilityCoverage({
        registry,
        manifests: [attentionLifecycleManifest, unsafe],
      }).map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        "RISK_SUMMARY_MISMATCH",
        "COMPLETE_FEATURE_WITH_NOT_YET_MCP_STRATEGY",
      ]),
    );
  });

  it("requires routes, conflict strategy and audit events", () => {
    const incomplete: EditabilityManifest = {
      ...attentionLifecycleManifest,
      uiRoutes: [],
      conflictStrategy: null,
      auditEvents: [],
    };

    expect(
      validateEditabilityCoverage({
        registry,
        manifests: [incomplete, roadmapStageCompletionManifest],
      }).map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        "UI_ROUTE_MISSING",
        "CONFLICT_STRATEGY_MISSING",
        "AUDIT_EVENT_MISSING",
      ]),
    );
  });
});
