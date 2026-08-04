import { describe, expect, it } from "vitest";
import { createDevOSCommandRegistry } from "./devos-command-registry";

describe("DevOS command registry composition", () => {
  it("registers the enabled Attention pilot and blocked high-risk stage command", () => {
    expect(createDevOSCommandRegistry().listManifests()).toEqual([
      {
        commandId: "attention.transition",
        commandVersion: 1,
        capability: "attention.write",
        resourceType: "attention_item",
        riskFloor: "medium",
        confirmation: "confirm_in_client",
        conflictStrategy: "expected_timestamp",
        idempotencyStrategy: "required_receipt",
        undoStrategy: "compensating_command",
        auditStrategy: "state_and_receipt",
        execution: "enabled",
      },
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
});
