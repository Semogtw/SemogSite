import type { CommandPolicy } from "../command-gateway";
import type {
  CommandContext,
  CommandTarget,
  PolicyDecision,
  RiskTier,
} from "../core";
import type { CommandManifest } from "../command-registry";
import {
  capabilityForCommand,
  domainForCapability,
  type AgentAuthorizationDomain,
} from "./capabilities";
import {
  decideAgentCommandDisposition,
  type AgentCommandRisk,
} from "./policy-engine";
import type {
  AgentCapability,
  CommandResource,
  EffectiveAgentAuthorization,
} from "./types";
import type { AgentWriteSwitchState } from "./write-switches";

export type AgentCommandPolicyMaterial = {
  authorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
  resource: CommandResource;
  risk: AgentCommandRisk;
  manifest: CommandManifest;
  context: CommandContext;
  target: CommandTarget;
};

export type AgentCommandPolicyDependencies = {
  authorization: EffectiveAgentAuthorization | null;
  resolveResource(target: CommandTarget): CommandResource | null;
  readWriteSwitches(domain: AgentAuthorizationDomain): AgentWriteSwitchState;
  trustCoversCommand(input: AgentCommandPolicyMaterial): boolean;
  confirmationValid(input: AgentCommandPolicyMaterial): boolean;
};

function deny(risk: RiskTier, reasonCode: string): PolicyDecision {
  return {
    outcome: "deny",
    risk,
    reasonCode,
    approvalId: null,
  };
}

function agentRisk(value: RiskTier): AgentCommandRisk | null {
  return value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
    ? value
    : null;
}

function disabledSwitches(): AgentWriteSwitchState {
  return {
    globalEnabled: false,
    clientEnabled: false,
    domainEnabled: false,
  };
}

export function createAgentCommandPolicy(
  dependencies: AgentCommandPolicyDependencies,
): CommandPolicy {
  return {
    evaluate(manifest, context, target) {
      if (context.actor.kind !== "mcp_client") {
        return deny(manifest.riskFloor, "AGENT_CLIENT_REQUIRED");
      }

      const authorization = dependencies.authorization;
      if (
        authorization === null ||
        authorization.ownerId !== context.ownerId ||
        authorization.clientId !== context.actor.clientId
      ) {
        return deny(manifest.riskFloor, "NO_EFFECTIVE_GRANT");
      }

      if (manifest.execution !== "enabled") {
        return deny(manifest.riskFloor, "COMMAND_EXECUTION_BLOCKED");
      }

      let capability: AgentCapability;
      let domain: AgentAuthorizationDomain;
      try {
        capability = capabilityForCommand(manifest.capability);
        domain = domainForCapability(capability);
      } catch {
        return deny(manifest.riskFloor, "CAPABILITY_DENIED");
      }

      const risk = agentRisk(manifest.riskFloor);
      if (
        risk === null ||
        target.resourceType !== manifest.resourceType
      ) {
        return deny(manifest.riskFloor, "COMMAND_POLICY_INPUT_INVALID");
      }

      let resource: CommandResource | null;
      try {
        resource = dependencies.resolveResource(target);
      } catch {
        resource = null;
      }
      if (
        resource === null ||
        resource.kind !== target.resourceType ||
        resource.id !== target.resourceId
      ) {
        return deny(manifest.riskFloor, "RESOURCE_DENIED");
      }

      let writeSwitches: AgentWriteSwitchState;
      try {
        writeSwitches = dependencies.readWriteSwitches(domain);
      } catch {
        writeSwitches = disabledSwitches();
      }

      const material: AgentCommandPolicyMaterial = {
        authorization,
        capability,
        resource,
        risk,
        manifest,
        context,
        target,
      };

      let trustCoversCommand = false;
      let confirmationValid = false;
      if (risk === "low" || risk === "medium") {
        try {
          trustCoversCommand =
            dependencies.trustCoversCommand(material) === true;
        } catch {
          trustCoversCommand = false;
        }
        try {
          confirmationValid =
            dependencies.confirmationValid(material) === true;
        } catch {
          confirmationValid = false;
        }
      }

      return decideAgentCommandDisposition({
        authorization,
        command: {
          capability,
          domain,
          risk,
          confirmation: manifest.confirmation,
          resource,
        },
        writeSwitches,
        trustCoversCommand,
        confirmationValid,
      });
    },
  };
}
