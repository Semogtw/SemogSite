import { describe, expect, it } from "vitest";
import type { CommandContext } from "./core";
import type { CommandManifest } from "./command-registry";
import { OwnerBrowserPolicy } from "./owner-browser-policy";

const baseManifest: CommandManifest = {
  commandId: "attention.transition",
  commandVersion: 1,
  capability: "attention.write",
  resourceType: "attention",
  riskFloor: "medium",
  confirmation: "confirm_in_client",
  conflictStrategy: "expected_timestamp",
  idempotencyStrategy: "required_receipt",
  undoStrategy: "compensating_command",
  auditStrategy: "state_and_receipt",
  execution: "enabled",
};

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    ownerId: "owner-1",
    actor: { kind: "owner_ui", actorId: "owner-1" },
    correlationId: "correlation-1",
    idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
    reason: "Test policy",
    confirmed: false,
    approvalId: null,
    ...overrides,
  };
}

describe("OwnerBrowserPolicy", () => {
  const policy = new OwnerBrowserPolicy();

  it("allows read and low-risk owner commands", () => {
    expect(
      policy.evaluate(
        { ...baseManifest, riskFloor: "low", confirmation: "allow" },
        context(),
      ),
    ).toMatchObject({ outcome: "allow", risk: "low" });
    expect(
      policy.evaluate(
        { ...baseManifest, riskFloor: "read", confirmation: "allow" },
        context(),
      ),
    ).toMatchObject({ outcome: "allow", risk: "read" });
  });

  it("requires and consumes explicit client confirmation for medium risk", () => {
    expect(policy.evaluate(baseManifest, context())).toMatchObject({
      outcome: "confirm_in_client",
      risk: "medium",
      reasonCode: "CLIENT_CONFIRMATION_REQUIRED",
    });
    expect(
      policy.evaluate(baseManifest, context({ confirmed: true })),
    ).toMatchObject({
      outcome: "allow",
      risk: "medium",
      reasonCode: "CLIENT_CONFIRMATION_ACCEPTED",
    });
  });

  it.each(["high", "critical"] as const)(
    "never executes %s risk from owner confirmation or an unverified approval ID",
    (riskFloor) => {
      expect(
        policy.evaluate(
          {
            ...baseManifest,
            riskFloor,
            confirmation: "approve_in_devos",
          },
          context({
            confirmed: true,
            approvalId: "unverified-approval",
          }),
        ),
      ).toEqual({
        outcome: "approve_in_devos",
        risk: riskFloor,
        reasonCode: "DEVOS_APPROVAL_REQUIRED",
        approvalId: null,
      });
    },
  );

  it("fails closed for non-owner actors and owner mismatches", () => {
    expect(
      policy.evaluate(
        baseManifest,
        context({
          actor: {
            kind: "mcp_client",
            actorId: "agent-1",
            clientId: "client-1",
          },
        }),
      ),
    ).toMatchObject({ outcome: "deny", reasonCode: "OWNER_UI_REQUIRED" });
    expect(
      policy.evaluate(
        baseManifest,
        context({ actor: { kind: "owner_ui", actorId: "other-owner" } }),
      ),
    ).toMatchObject({ outcome: "deny", reasonCode: "OWNER_IDENTITY_MISMATCH" });
  });

  it("does not execute registered-but-blocked commands", () => {
    expect(
      policy.evaluate(
        { ...baseManifest, execution: "registered_blocked" },
        context({ confirmed: true }),
      ),
    ).toEqual({
      outcome: "deny",
      risk: "medium",
      reasonCode: "COMMAND_EXECUTION_BLOCKED",
      approvalId: null,
    });
    expect(
      policy.evaluate(
        {
          ...baseManifest,
          execution: "registered_blocked",
          riskFloor: "high",
          confirmation: "approve_in_devos",
        },
        context({ confirmed: true }),
      ),
    ).toEqual({
      outcome: "approve_in_devos",
      risk: "high",
      reasonCode: "APPROVAL_EXECUTOR_NOT_AVAILABLE",
      approvalId: null,
    });
  });

  it("respects a stricter manifest even when the risk default is lower", () => {
    expect(
      policy.evaluate(
        {
          ...baseManifest,
          riskFloor: "low",
          confirmation: "confirm_in_client",
        },
        context(),
      ),
    ).toMatchObject({ outcome: "confirm_in_client", risk: "low" });
  });
});
