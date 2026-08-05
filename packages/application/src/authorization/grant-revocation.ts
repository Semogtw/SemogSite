import type { CommandActor } from "../core";
import { normalizeBoundedUniqueIds } from "./id-list";
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
  const revokeTrustSessionIds = normalizeBoundedUniqueIds(
    input.activeTrustSessionIds,
  );
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
