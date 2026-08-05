import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import type { AgentTrustSession } from "./types";

export type AgentTrustSessionRevocationPlan = {
  trustSessionId: string;
  ownerId: string;
  clientId: string;
  expectedVersion: number;
  nextVersion: number;
  revokedAt: string;
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

export function planAgentTrustSessionRevocation(input: {
  actor: CommandActor;
  session: AgentTrustSession;
  now: string;
  reason: string;
}): AgentTrustSessionRevocationPlan | null {
  if (input.actor.kind !== "owner_ui") {
    throw new Error("TRUST_SESSION_REVOCATION_OWNER_REQUIRED");
  }
  if (input.actor.actorId !== input.session.ownerId) {
    throw new Error("TRUST_SESSION_REVOCATION_OWNER_MISMATCH");
  }
  if (
    !bounded(input.session.id, 200) ||
    !bounded(input.session.ownerId, 200) ||
    !bounded(input.session.clientId, 200) ||
    !Number.isInteger(input.session.version) ||
    input.session.version < 1 ||
    input.session.version >= Number.MAX_SAFE_INTEGER ||
    !isCanonicalUtcTimestamp(input.now) ||
    !bounded(input.reason, 500) ||
    (input.session.revokedAt !== null &&
      !isCanonicalUtcTimestamp(input.session.revokedAt))
  ) {
    throw new Error("TRUST_SESSION_REVOCATION_INVALID");
  }

  if (input.session.revokedAt !== null) return null;

  return {
    trustSessionId: input.session.id,
    ownerId: input.session.ownerId,
    clientId: input.session.clientId,
    expectedVersion: input.session.version,
    nextVersion: input.session.version + 1,
    revokedAt: input.now,
    reason: input.reason,
  };
}
