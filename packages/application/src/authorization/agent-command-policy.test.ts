import { describe, expect, it, vi } from "vitest";
import type { CommandContext, CommandTarget } from "../core";
import type { CommandManifest } from "../command-registry";
import {
  createAgentCommandPolicy,
  type AgentCommandPolicyDependencies,
  type AgentCommandPolicyMaterial,
} from "./agent-command-policy";
import type { AgentAuthorizationDomain } from "./capabilities";
import type {
  CommandResource,
  EffectiveAgentAuthorization,
} from "./types";
import type { AgentWriteSwitchState } from "./write-switches";

const resourceSelectors = {
  attention_item: [{ kind: "exact_ids" as const, ids: ["attention_1"] }],
};

const authorization: EffectiveAgentAuthorization = {
  clientId: "client_1",
  ownerId: "owner_1",
  capabilities: ["attention.write"],
  resourceSelectors,
  capabilityResourceSelectors: {
    "attention.write": resourceSelectors,
  },
  riskCeiling: "medium",
  riskCeilingByCapability: { "attention.write": "medium" },
  authorizationClauses: [
    {
      grantId: "grant_1",
      capability: "attention.write",
      resourceSelectors,
      riskCeiling: "medium",
    },
  ],
  grantIds: ["grant_1"],
  trustSessionIds: [],
};

function manifest(
  overrides: Partial<CommandManifest> = {},
): CommandManifest {
  return {
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
    ...overrides,
  };
}

function context(
  overrides: Partial<CommandContext> = {},
): CommandContext {
  return {
    ownerId: "owner_1",
    actor: {
      kind: "mcp_client",
      actorId: "agent_1",
      clientId: "client_1",
    },
    correlationId: "correlation_1",
    idempotencyKey: "idempotency_1",
    reason: "Aplicar alteração autorizada.",
    confirmed: false,
    approvalId: null,
    ...overrides,
  };
}

const target: CommandTarget = {
  resourceType: "attention_item",
  resourceId: "attention_1",
};

function dependencies() {
  const result = {
    authorization,
    resolveResource: vi.fn<
      (target: CommandTarget) => CommandResource | null
    >((_target) => ({
      kind: "attention_item",
      id: "attention_1",
      parentRefs: [],
      lifecycleState: "open",
    })),
    readWriteSwitches: vi.fn<
      (domain: AgentAuthorizationDomain) => AgentWriteSwitchState
    >((_domain) => ({
      globalEnabled: true,
      clientEnabled: true,
      domainEnabled: true,
    })),
    trustCoversCommand: vi.fn<
      (input: AgentCommandPolicyMaterial) => boolean
    >(() => false),
    confirmationValid: vi.fn<
      (input: AgentCommandPolicyMaterial) => boolean
    >(() => false),
  } satisfies AgentCommandPolicyDependencies;
  return result;
}

describe("provider-neutral agent command policy", () => {
  it("uses the canonical target and closed domain for medium confirmation", () => {
    const deps = dependencies();
    const policy = createAgentCommandPolicy(deps);

    expect(policy.evaluate(manifest(), context(), target)).toMatchObject({
      outcome: "confirm_in_client",
      reasonCode: "CLIENT_CONFIRMATION_REQUIRED",
    });
    expect(deps.resolveResource).toHaveBeenCalledWith(target);
    expect(deps.readWriteSwitches).toHaveBeenCalledWith("attention");
    expect(deps.trustCoversCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "attention.write",
        risk: "medium",
        resource: expect.objectContaining({ id: "attention_1" }),
      }),
    );
  });

  it("ignores client-provided confirmed and approvalId fields", () => {
    const deps = dependencies();
    const policy = createAgentCommandPolicy(deps);

    expect(
      policy.evaluate(
        manifest(),
        context({ confirmed: true, approvalId: "client_supplied" }),
        target,
      ),
    ).toMatchObject({
      outcome: "confirm_in_client",
      reasonCode: "CLIENT_CONFIRMATION_REQUIRED",
    });

    expect(
      policy.evaluate(
        manifest({ riskFloor: "high", confirmation: "approve_in_devos" }),
        context({ confirmed: true, approvalId: "client_supplied" }),
        target,
      ),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "RISK_CEILING_EXCEEDED",
    });
  });

  it("requires an MCP client bound to the effective owner and client", () => {
    const deps = dependencies();
    const policy = createAgentCommandPolicy(deps);

    expect(
      policy.evaluate(
        manifest(),
        context({ actor: { kind: "owner_ui", actorId: "owner_1" } }),
        target,
      ),
    ).toMatchObject({ outcome: "deny", reasonCode: "AGENT_CLIENT_REQUIRED" });

    expect(
      policy.evaluate(
        manifest(),
        context({
          actor: {
            kind: "mcp_client",
            actorId: "agent_1",
            clientId: "client_other",
          },
        }),
        target,
      ),
    ).toMatchObject({ outcome: "deny", reasonCode: "NO_EFFECTIVE_GRANT" });
    expect(deps.resolveResource).not.toHaveBeenCalled();
  });

  it("denies registered-blocked commands before resource or switch reads", () => {
    const deps = dependencies();
    const policy = createAgentCommandPolicy(deps);

    expect(
      policy.evaluate(
        manifest({ execution: "registered_blocked" }),
        context(),
        target,
      ),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "COMMAND_EXECUTION_BLOCKED",
    });
    expect(deps.resolveResource).not.toHaveBeenCalled();
    expect(deps.readWriteSwitches).not.toHaveBeenCalled();
  });

  it("denies an unresolved canonical resource without exposing details", () => {
    const deps = dependencies();
    deps.resolveResource.mockReturnValue(null);
    const policy = createAgentCommandPolicy(deps);

    expect(policy.evaluate(manifest(), context(), target)).toEqual({
      outcome: "deny",
      risk: "medium",
      reasonCode: "RESOURCE_DENIED",
      approvalId: null,
    });
  });

  it("allows medium risk only through injected trust or challenge state", () => {
    const trusted = dependencies();
    trusted.trustCoversCommand.mockReturnValue(true);
    expect(
      createAgentCommandPolicy(trusted).evaluate(manifest(), context(), target),
    ).toMatchObject({ outcome: "allow", reasonCode: "TRUST_SESSION_ACCEPTED" });

    const challenged = dependencies();
    challenged.confirmationValid.mockReturnValue(true);
    expect(
      createAgentCommandPolicy(challenged).evaluate(
        manifest(),
        context({ confirmed: false, approvalId: null }),
        target,
      ),
    ).toMatchObject({
      outcome: "allow",
      reasonCode: "CONFIRMATION_CHALLENGE_ACCEPTED",
    });
  });

  it("fails closed when a dependency throws", () => {
    const deps = dependencies();
    deps.readWriteSwitches.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(
      createAgentCommandPolicy(deps).evaluate(manifest(), context(), target),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "REMOTE_WRITES_DISABLED",
    });
  });
});
