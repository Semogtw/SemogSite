import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { normalizeBoundedUniqueIds } from "./id-list";

export type AgentClientRevocationPlan = {
  ownerId: string;
  clientId: string;
  expectedClientVersion: number;
  nextClientVersion: number;
  revokeGrantIds: readonly string[];
  revokeTrustSessionIds: readonly string[];
  cancelChallengeIds: readonly string[];
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

export function planAgentClientRevocation(input: {
  actor: CommandActor;
  ownerId: string;
  clientId: string;
  expectedClientVersion: number;
  activeGrantIds: readonly string[];
  activeTrustSessionIds: readonly string[];
  pendingChallengeIds: readonly string[];
  now: string;
  reason: string;
}): AgentClientRevocationPlan {
  if (input.actor.kind !== "owner_ui") {
    throw new Error("AGENT_CLIENT_REVOCATION_OWNER_REQUIRED");
  }

  const revokeGrantIds = normalizeBoundedUniqueIds(input.activeGrantIds);
  const revokeTrustSessionIds = normalizeBoundedUniqueIds(
    input.activeTrustSessionIds,
  );
  const cancelChallengeIds = normalizeBoundedUniqueIds(
    input.pendingChallengeIds,
  );
  if (
    !bounded(input.ownerId, 200) ||
    !bounded(input.clientId, 200) ||
    !Number.isInteger(input.expectedClientVersion) ||
    input.expectedClientVersion < 1 ||
    input.expectedClientVersion >= Number.MAX_SAFE_INTEGER ||
    !isCanonicalUtcTimestamp(input.now) ||
    !bounded(input.reason, 500) ||
    revokeGrantIds === null ||
    revokeTrustSessionIds === null ||
    cancelChallengeIds === null
  ) {
    throw new Error("AGENT_CLIENT_REVOCATION_INVALID");
  }
  if (input.actor.actorId !== input.ownerId) {
    throw new Error("AGENT_CLIENT_REVOCATION_OWNER_MISMATCH");
  }

  return {
    ownerId: input.ownerId,
    clientId: input.clientId,
    expectedClientVersion: input.expectedClientVersion,
    nextClientVersion: input.expectedClientVersion + 1,
    revokeGrantIds,
    revokeTrustSessionIds,
    cancelChallengeIds,
    revokedAt: input.now,
    reason: input.reason,
  };
}
