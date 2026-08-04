import { describe, expect, it } from "vitest";
import { CommandGateway } from "../command-gateway";
import { CommandRegistry } from "../command-registry";
import { OwnerBrowserPolicy } from "../owner-browser-policy";
import { completeStageCommand } from "./complete-stage-command";

describe("roadmap.stages.complete command definition", () => {
  it("registers a high-risk blocked command with explicit compensation", () => {
    const registry = new CommandRegistry([completeStageCommand]);

    expect(registry.listManifests()).toEqual([
      {
        commandId: "roadmap.stages.complete",
        commandVersion: 1,
        capability: "roadmap.write",
        resourceType: "stage",
        riskFloor: "high",
        confirmation: "approve_in_devos",
        conflictStrategy: "exact_snapshot",
        idempotencyStrategy: "required_receipt",
        undoStrategy: "compensating_command",
        auditStrategy: "state_and_receipt",
        execution: "registered_blocked",
      },
    ]);
  });

  it("binds a strict bounded stage payload", () => {
    const payload = completeStageCommand.schema.parse({
      stageId: "  stage-1  ",
      reason: "  Critérios e evidências conferidos.  ",
    });

    expect(payload).toEqual({
      stageId: "stage-1",
      reason: "Critérios e evidências conferidos.",
    });
    expect(completeStageCommand.bindResource(payload)).toEqual({
      resourceType: "stage",
      resourceId: "stage-1",
    });
  });

  it("never allows execution from owner confirmation alone", async () => {
    const gateway = new CommandGateway(
      new CommandRegistry([completeStageCommand]),
      new OwnerBrowserPolicy(),
    );

    await expect(
      gateway.prepare({
        commandId: "roadmap.stages.complete",
        commandVersion: 1,
        target: { resourceType: "stage", resourceId: "stage-1" },
        payload: {
          stageId: "stage-1",
          reason: "Critérios e evidências conferidos.",
        },
        expected: {
          stageUpdatedAt: "2026-08-04T05:00:00.000Z",
          snapshotHash: "a".repeat(64),
        },
        context: {
          ownerId: "owner-1",
          actor: { kind: "owner_ui", actorId: "owner-1" },
          correlationId: "correlation-1",
          idempotencyKey: "idempotency-1",
          reason: "Critérios e evidências conferidos.",
          confirmed: true,
          approvalId: "unverified-client-value",
        },
      }),
    ).resolves.toMatchObject({
      decision: {
        outcome: "approve_in_devos",
        risk: "high",
        approvalId: null,
        reasonCode: "APPROVAL_EXECUTOR_NOT_AVAILABLE",
      },
    });
  });
});
