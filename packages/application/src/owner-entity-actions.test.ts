import { describe, expect, it } from "vitest";
import { transitionAttentionCommand } from "./attention/transition-attention-command";
import { CommandRegistry } from "./command-registry";
import {
  attentionLifecycleManifest,
  roadmapStageCompletionManifest,
} from "./editability-manifest";
import { listOwnerEntityActions } from "./owner-entity-actions";
import { OwnerBrowserPolicy } from "./owner-browser-policy";
import { completeStageCommand } from "./roadmap/complete-stage-command";

const registry = new CommandRegistry([
  transitionAttentionCommand,
  completeStageCommand,
]);
const manifests = [attentionLifecycleManifest, roadmapStageCompletionManifest];
const policy = new OwnerBrowserPolicy();
const context = {
  ownerId: "owner-1",
  actor: { kind: "owner_ui" as const, actorId: "owner-1" },
  correlationId: "discovery",
  idempotencyKey: "discovery",
  reason: "Discover available actions",
  confirmed: false,
  approvalId: null,
};

describe("owner entity actions", () => {
  it("returns bounded Portuguese metadata for an Attention item", () => {
    expect(
      listOwnerEntityActions({
        registry,
        manifests,
        policy,
        resourceType: "attention_item",
        resourceId: "attention-1",
        context,
      }),
    ).toEqual([
      {
        commandId: "attention.transition",
        labelPtBr: "Finalizar item",
        risk: "medium",
        reversible: true,
        availability: "confirmation_required",
      },
    ]);
  });

  it("shows registered-blocked stage completion as planned", () => {
    expect(
      listOwnerEntityActions({
        registry,
        manifests,
        policy,
        resourceType: "stage",
        resourceId: "stage-1",
        context,
      }),
    ).toEqual([
      {
        commandId: "roadmap.stages.complete",
        labelPtBr: "Concluir etapa",
        risk: "high",
        reversible: true,
        availability: "planned",
      },
    ]);
  });

  it("returns no schemas, capabilities or actions to a mismatched principal", () => {
    const actions = listOwnerEntityActions({
      registry,
      manifests,
      policy,
      resourceType: "attention_item",
      resourceId: "attention-1",
      context: {
        ...context,
        actor: { kind: "owner_ui", actorId: "different-owner" },
      },
    });

    expect(actions).toEqual([]);
    expect(JSON.stringify(actions)).not.toContain("schema");
    expect(JSON.stringify(actions)).not.toContain("capability");
  });
});
