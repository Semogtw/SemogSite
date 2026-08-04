import { describe, expect, it } from "vitest";
import { createDevOSCommandRegistry } from "./devos-command-registry";

describe("DevOS command registry composition", () => {
  it("registers the enabled Attention pilot exactly once", () => {
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
    ]);
  });
});
