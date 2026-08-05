import type { CommandActor } from "../core";
import {
  validateAgentGrantRequest,
  type AgentGrantRequest,
} from "./grant-request";
import { sanitizeResourceSelectorMapBoundary } from "./resource-selector-boundary";
import type { AgentGrantDefinition } from "./types";

export type AgentGrantCreationPlan = {
  grant: AgentGrantDefinition;
  createdAt: string;
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

export function planAgentGrantCreation(input: {
  actor: CommandActor;
  grantId: string;
  request: AgentGrantRequest;
  explicitAllResourceKinds: readonly string[];
  now: string;
}): AgentGrantCreationPlan {
  if (input.actor.kind !== "owner_ui") {
    throw new Error("AGENT_GRANT_OWNER_REQUIRED");
  }
  if (!bounded(input.grantId, 200)) {
    throw new Error("AGENT_GRANT_CREATION_INVALID");
  }

  const request = validateAgentGrantRequest({
    actor: input.actor,
    request: input.request,
    explicitAllResourceKinds: input.explicitAllResourceKinds,
    now: input.now,
  });
  const resourceSelectors = sanitizeResourceSelectorMapBoundary(
    request.resourceSelectors,
  );

  return {
    grant: {
      id: input.grantId,
      ownerId: request.ownerId,
      clientId: request.clientId,
      profileId: request.profileId,
      status: "active",
      capabilities: [...request.capabilities].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
      resourceSelectors,
      riskCeiling: request.riskCeiling,
      expiresAt: request.expiresAt,
      version: 1,
    },
    createdAt: input.now,
    reason: request.reason,
  };
}
