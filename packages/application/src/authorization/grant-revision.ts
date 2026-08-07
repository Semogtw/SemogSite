import type { CommandActor } from "../core";
import { normalizeBoundedUniqueIds } from "./id-list";
import {
  validateAgentGrantRequest,
  type AgentGrantRequest,
} from "./grant-request";
import { evaluateAgentGrantState } from "./grant-lifecycle";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type { AgentGrantDefinition } from "./types";

export type AgentGrantRevisionPlan = {
  grantId: string;
  ownerId: string;
  clientId: string;
  fromStatus: "active" | "suspended";
  expectedVersion: number;
  nextVersion: number;
  nextGrant: AgentGrantDefinition;
  revokeTrustSessionIds: readonly string[];
  changedAt: string;
  reason: string;
};

export function planAgentGrantRevision(input: {
  actor: CommandActor;
  grant: AgentGrantDefinition;
  request: AgentGrantRequest;
  explicitAllResourceKinds: readonly string[];
  activeTrustSessionIds: readonly string[];
  now: string;
}): AgentGrantRevisionPlan {
  if (input.actor.kind !== "owner_ui") {
    throw new Error("AGENT_GRANT_OWNER_REQUIRED");
  }

  const revokeTrustSessionIds = normalizeBoundedUniqueIds(
    input.activeTrustSessionIds,
  );
  if (revokeTrustSessionIds === null) {
    throw new Error("AGENT_GRANT_REVISION_INVALID");
  }

  const runtimeState = evaluateAgentGrantState(input.grant, input.now);
  if (runtimeState === "invalid") {
    throw new Error("AGENT_GRANT_REVISION_INVALID");
  }
  if (runtimeState === "revoked" || runtimeState === "expired") {
    throw new Error("AGENT_GRANT_TERMINAL");
  }
  if (runtimeState !== "active" && runtimeState !== "suspended") {
    throw new Error("AGENT_GRANT_REVISION_INVALID");
  }

  const request = validateAgentGrantRequest({
    actor: input.actor,
    request: input.request,
    explicitAllResourceKinds: input.explicitAllResourceKinds,
    now: input.now,
  });
  if (
    request.ownerId !== input.grant.ownerId ||
    request.clientId !== input.grant.clientId
  ) {
    throw new Error("AGENT_GRANT_REVISION_IDENTITY_MISMATCH");
  }

  const nextVersion = input.grant.version + 1;
  const resourceSelectors = sanitizeResourceSelectorMapBoundary(
    request.resourceSelectors,
  );
  return {
    grantId: input.grant.id,
    ownerId: input.grant.ownerId,
    clientId: input.grant.clientId,
    fromStatus: runtimeState,
    expectedVersion: input.grant.version,
    nextVersion,
    nextGrant: {
      id: input.grant.id,
      ownerId: input.grant.ownerId,
      clientId: input.grant.clientId,
      profileId: request.profileId,
      status: runtimeState,
      capabilities: [...request.capabilities].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
      resourceSelectors,
      riskCeiling: request.riskCeiling,
      expiresAt: request.expiresAt,
      version: nextVersion,
    },
    revokeTrustSessionIds,
    changedAt: input.now,
    reason: request.reason,
  };
}
