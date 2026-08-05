import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { evaluateAgentGrantState } from "./grant-lifecycle";
import type { AgentGrantDefinition } from "./types";

export type AgentGrantExpirationPlan = {
  grantId: string;
  ownerId: string;
  clientId: string;
  fromStatus: "active" | "suspended";
  toStatus: "expired";
  expectedVersion: number;
  nextVersion: number;
  revokeTrustSessionIds: readonly string[];
  expiredAt: string;
  triggeredByActorId: string;
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

export function planAgentGrantExpiration(input: {
  actor: CommandActor;
  grant: AgentGrantDefinition;
  activeTrustSessionIds: readonly string[];
  now: string;
  reason: string;
}): AgentGrantExpirationPlan | null {
  if (input.actor.kind !== "system") {
    throw new Error("AGENT_GRANT_EXPIRATION_SYSTEM_REQUIRED");
  }

  const revokeTrustSessionIds = normalizeIds(input.activeTrustSessionIds);
  if (
    !bounded(input.actor.actorId, 200) ||
    !isCanonicalUtcTimestamp(input.now) ||
    !bounded(input.reason, 500) ||
    revokeTrustSessionIds === null
  ) {
    throw new Error("AGENT_GRANT_EXPIRATION_INVALID");
  }

  const runtimeState = evaluateAgentGrantState(input.grant, input.now);
  if (runtimeState === "invalid") {
    throw new Error("AGENT_GRANT_EXPIRATION_INVALID");
  }
  if (input.grant.status === "expired") return null;
  if (input.grant.status === "revoked") {
    throw new Error("AGENT_GRANT_TERMINAL");
  }
  if (
    input.grant.expiresAt === null ||
    input.grant.expiresAt > input.now
  ) {
    throw new Error("AGENT_GRANT_NOT_EXPIRED");
  }
  if (
    input.grant.status !== "active" &&
    input.grant.status !== "suspended"
  ) {
    throw new Error("AGENT_GRANT_EXPIRATION_INVALID");
  }

  return {
    grantId: input.grant.id,
    ownerId: input.grant.ownerId,
    clientId: input.grant.clientId,
    fromStatus: input.grant.status,
    toStatus: "expired",
    expectedVersion: input.grant.version,
    nextVersion: input.grant.version + 1,
    revokeTrustSessionIds,
    expiredAt: input.now,
    triggeredByActorId: input.actor.actorId,
    reason: input.reason,
  };
}
