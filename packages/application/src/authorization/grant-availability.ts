import type { CommandActor } from "../core";
import {
  planAgentGrantStatusTransition,
  type AgentGrantStatusTransitionPlan,
} from "./grant-lifecycle";
import type { AgentGrantDefinition } from "./types";

export type AgentGrantAvailabilityTransitionPlan = Omit<
  AgentGrantStatusTransitionPlan,
  "toStatus"
> & {
  toStatus: "active" | "suspended";
};

export function planAgentGrantAvailabilityTransition(input: {
  actor: CommandActor;
  grant: AgentGrantDefinition;
  targetStatus: "active" | "suspended";
  now: string;
  reason: string;
}): AgentGrantAvailabilityTransitionPlan {
  if (
    input.targetStatus !== "active" &&
    input.targetStatus !== "suspended"
  ) {
    throw new Error("AGENT_GRANT_AVAILABILITY_INVALID");
  }

  const transition = planAgentGrantStatusTransition({
    actor: input.actor,
    grant: input.grant,
    targetStatus: input.targetStatus,
    now: input.now,
    reason: input.reason,
  });

  return {
    ...transition,
    toStatus: input.targetStatus,
  };
}
