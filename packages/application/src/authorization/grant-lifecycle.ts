import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { sanitizeAgentGrantDefinitionBoundary } from "./agent-grant-boundary";
import type {
  AgentGrantDefinition,
  AgentGrantStatus,
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

function evaluateSanitizedAgentGrantState(
  grant: AgentGrantDefinition,
  now: string,
): AgentGrantRuntimeState {
  if (!isCanonicalUtcTimestamp(now)) return "invalid";
  if (grant.status === "revoked") return "revoked";
  if (grant.status === "expired") return "expired";
  if (grant.expiresAt !== null && grant.expiresAt <= now) return "expired";
  return grant.status;
}

export function evaluateAgentGrantState(
  grant: AgentGrantDefinition,
  now: string,
): AgentGrantRuntimeState {
  const sanitized = sanitizeAgentGrantDefinitionBoundary(grant);
  return sanitized === null
    ? "invalid"
    : evaluateSanitizedAgentGrantState(sanitized, now);
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

  const grant = sanitizeAgentGrantDefinitionBoundary(input.grant);
  if (grant === null) {
    throw new Error("AGENT_GRANT_TRANSITION_INVALID");
  }
  const state = evaluateSanitizedAgentGrantState(grant, input.now);
  if (state === "invalid") {
    throw new Error("AGENT_GRANT_TRANSITION_INVALID");
  }
  if (input.actor.actorId !== grant.ownerId) {
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
    grantId: grant.id,
    ownerId: grant.ownerId,
    clientId: grant.clientId,
    fromStatus: state,
    toStatus: input.targetStatus,
    expectedVersion: grant.version,
    nextVersion: grant.version + 1,
    changedAt: input.now,
    reason: input.reason,
  };
}
