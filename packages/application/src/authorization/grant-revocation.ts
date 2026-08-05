import type { CommandActor } from "../core";
import { planAgentGrantStatusTransition } from "./grant-lifecycle";
import type { AgentGrantDefinition } from "./types";

export type AgentGrantRevocationPlan = {
  grantId: string;
  ownerId: string;
  clientId: string;
  fromStatus: "active" | "suspended";
  toStatus: "revoked";
  expectedVersion: number;
  nextVersion: number;
  revokeTrustSessionIds: readonly string[];
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

function normalizeIds(values: readonly string[]): readonly string[] | null {
  if (
    !Array.isArray(values) ||
    values.length > 10_000 ||
    values.some((value) => !bounded(value, 200)) ||
    new Set(values).size !== values.length
  ) {
    return null;
  }
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

export function planAgentGrantRevocation(input: {
  actor: CommandActor;
  grant: AgentGrantDefinition;
  activeTrustSessionIds: readonly string[];
  now: string;
  reason: string;
}): AgentGrantRevocationPlan {
  const transition = planAgentGrantStatusTransition({
    actor: input.actor,
    grant: input.grant,
    targetStatus: "revoked",
    now: input.now,
    reason: input.reason,
  });
  const revokeTrustSessionIds = normalizeIds(input.activeTrustSessionIds);
  if (revokeTrustSessionIds === null) {
    throw new Error("AGENT_GRANT_REVOCATION_INVALID");
  }

  return {
    grantId: transition.grantId,
    ownerId: transition.ownerId,
    clientId: transition.clientId,
    fromStatus: transition.fromStatus,
    toStatus: "revoked",
    expectedVersion: transition.expectedVersion,
    nextVersion: transition.nextVersion,
    revokeTrustSessionIds,
    changedAt: transition.changedAt,
    reason: transition.reason,
  };
}
