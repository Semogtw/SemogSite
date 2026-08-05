import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import {
  isAgentCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { validateResourceSelectorForKind } from "./resource-selectors";
import type {
  AgentGrantDefinition,
  AgentGrantStatus,
  AgentRiskCeiling,
} from "./types";

export type AgentGrantRuntimeState = AgentGrantStatus | "invalid";

export type AgentGrantStatusTransitionPlan = {
  grantId: string;
  ownerId: string;
  clientId: string;
  fromStatus: "active" | "suspended";
  toStatus: "active" | "suspended" | "revoked";
  expectedVersion: number;
  nextVersion: number;
  changedAt: string;
  reason: string;
};

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function statusValid(value: unknown): value is AgentGrantStatus {
  return (
    value === "active" ||
    value === "suspended" ||
    value === "revoked" ||
    value === "expired"
  );
}

function riskValid(value: unknown): value is AgentRiskCeiling {
  return value === "low" || value === "medium" || value === "high";
}

function selectorsValid(grant: AgentGrantDefinition): boolean {
  if (!plainRecord(grant.resourceSelectors)) return false;
  const allowedKinds = new Set(
    grant.capabilities.flatMap((capability) =>
      resourceKindsForCapability(capability),
    ),
  );
  const actualKinds = Object.keys(grant.resourceSelectors);
  if (actualKinds.some((kind) => !allowedKinds.has(kind))) return false;

  for (const capability of grant.capabilities) {
    for (const resourceKind of resourceKindsForCapability(capability)) {
      const selectors = grant.resourceSelectors[resourceKind];
      if (!Array.isArray(selectors) || selectors.length === 0) return false;
      for (const selector of selectors) {
        try {
          validateResourceSelectorForKind({
            resourceKind,
            selector,
            explicitOwnerSelection: selector.kind === "all",
          });
        } catch {
          return false;
        }
      }
    }
  }
  return true;
}

function grantValid(grant: AgentGrantDefinition, now: string): boolean {
  return (
    isCanonicalUtcTimestamp(now) &&
    bounded(grant.id, 200) &&
    bounded(grant.ownerId, 200) &&
    bounded(grant.clientId, 200) &&
    (grant.profileId === null || bounded(grant.profileId, 200)) &&
    statusValid(grant.status) &&
    riskValid(grant.riskCeiling) &&
    (grant.expiresAt === null || isCanonicalUtcTimestamp(grant.expiresAt)) &&
    Number.isInteger(grant.version) &&
    grant.version >= 1 &&
    grant.version < Number.MAX_SAFE_INTEGER &&
    Array.isArray(grant.capabilities) &&
    grant.capabilities.length >= 1 &&
    new Set(grant.capabilities).size === grant.capabilities.length &&
    grant.capabilities.every((capability) => isAgentCapability(capability)) &&
    selectorsValid(grant)
  );
}

export function evaluateAgentGrantState(
  grant: AgentGrantDefinition,
  now: string,
): AgentGrantRuntimeState {
  if (!grantValid(grant, now)) return "invalid";
  if (grant.status === "revoked") return "revoked";
  if (grant.status === "expired") return "expired";
  if (grant.expiresAt !== null && grant.expiresAt <= now) return "expired";
  return grant.status;
}

export function planAgentGrantStatusTransition(input: {
  actor: CommandActor;
  grant: AgentGrantDefinition;
  targetStatus: "active" | "suspended" | "revoked";
  now: string;
  reason: string;
}): AgentGrantStatusTransitionPlan {
  if (input.actor.kind !== "owner_ui") {
    throw new Error("AGENT_GRANT_OWNER_REQUIRED");
  }
  if (
    !isCanonicalUtcTimestamp(input.now) ||
    !bounded(input.reason, 500) ||
    (input.targetStatus !== "active" &&
      input.targetStatus !== "suspended" &&
      input.targetStatus !== "revoked")
  ) {
    throw new Error("AGENT_GRANT_TRANSITION_INVALID");
  }

  const state = evaluateAgentGrantState(input.grant, input.now);
  if (state === "invalid") {
    throw new Error("AGENT_GRANT_TRANSITION_INVALID");
  }
  if (input.actor.actorId !== input.grant.ownerId) {
    throw new Error("AGENT_GRANT_OWNER_MISMATCH");
  }
  if (state === "revoked" || state === "expired") {
    throw new Error("AGENT_GRANT_TERMINAL");
  }
  if (state !== "active" && state !== "suspended") {
    throw new Error("AGENT_GRANT_TRANSITION_INVALID");
  }

  const allowed =
    (state === "active" &&
      (input.targetStatus === "suspended" ||
        input.targetStatus === "revoked")) ||
    (state === "suspended" &&
      (input.targetStatus === "active" ||
        input.targetStatus === "revoked"));
  if (!allowed) throw new Error("AGENT_GRANT_TRANSITION_INVALID");

  return {
    grantId: input.grant.id,
    ownerId: input.grant.ownerId,
    clientId: input.grant.clientId,
    fromStatus: state,
    toStatus: input.targetStatus,
    expectedVersion: input.grant.version,
    nextVersion: input.grant.version + 1,
    changedAt: input.now,
    reason: input.reason,
  };
}
