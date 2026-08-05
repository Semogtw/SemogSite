import type { AgentClientRevocationPlan } from "./client-revocation";
import type { AgentGrantCreationPlan } from "./grant-creation";
import type { AgentGrantRevocationPlan } from "./grant-revocation";
import type { TrustSessionOperationConsumptionPlan } from "./trust-session-consumption";
import type { AgentTrustSessionRevocationPlan } from "./trust-session-revocation";

export type AgentAuthorizationMutationStatus =
  | "applied"
  | "conflict"
  | "not_found"
  | "already_applied";

export type AgentAuthorizationMutationResult = {
  status: AgentAuthorizationMutationStatus;
  affectedRows: number;
};

export type AgentAuthorizationMutation =
  | {
      kind: "grant.create";
      plan: AgentGrantCreationPlan;
    }
  | {
      kind: "trust.consume";
      plan: TrustSessionOperationConsumptionPlan;
    }
  | {
      kind: "trust.revoke";
      plan: AgentTrustSessionRevocationPlan;
    }
  | {
      kind: "grant.revoke";
      plan: AgentGrantRevocationPlan;
    }
  | {
      kind: "client.revoke";
      plan: AgentClientRevocationPlan;
    };

/**
 * Persistence adapters must implement each method as one atomic transaction.
 * Optimistic versions in the plan are mandatory compare-and-swap predicates;
 * a method must never report `applied` after a partial cascade.
 */
export interface AgentAuthorizationMutationRepository {
  createGrant(
    plan: AgentGrantCreationPlan,
  ): Promise<AgentAuthorizationMutationResult>;
  consumeTrustSessionOperation(
    plan: TrustSessionOperationConsumptionPlan,
  ): Promise<AgentAuthorizationMutationResult>;
  revokeTrustSession(
    plan: AgentTrustSessionRevocationPlan,
  ): Promise<AgentAuthorizationMutationResult>;
  revokeGrant(
    plan: AgentGrantRevocationPlan,
  ): Promise<AgentAuthorizationMutationResult>;
  revokeClient(
    plan: AgentClientRevocationPlan,
  ): Promise<AgentAuthorizationMutationResult>;
}

function expectedAffectedRows(mutation: AgentAuthorizationMutation): number {
  switch (mutation.kind) {
    case "grant.create":
    case "trust.consume":
    case "trust.revoke":
      return 1;
    case "grant.revoke":
      return 1 + mutation.plan.revokeTrustSessionIds.length;
    case "client.revoke":
      return (
        1 +
        mutation.plan.revokeGrantIds.length +
        mutation.plan.revokeTrustSessionIds.length +
        mutation.plan.cancelChallengeIds.length
      );
  }
}

function resultValid(
  result: AgentAuthorizationMutationResult,
  expectedRows: number,
): boolean {
  if (
    typeof result !== "object" ||
    result === null ||
    !Number.isSafeInteger(result.affectedRows) ||
    result.affectedRows < 0
  ) {
    return false;
  }
  if (
    result.status !== "applied" &&
    result.status !== "conflict" &&
    result.status !== "not_found" &&
    result.status !== "already_applied"
  ) {
    return false;
  }
  return result.status === "applied"
    ? result.affectedRows === expectedRows
    : result.affectedRows === 0;
}

export function createAgentAuthorizationMutationExecutor(
  repository: AgentAuthorizationMutationRepository,
): (
  mutation: AgentAuthorizationMutation,
) => Promise<AgentAuthorizationMutationResult> {
  return async (mutation) => {
    let result: AgentAuthorizationMutationResult;
    switch (mutation.kind) {
      case "grant.create":
        result = await repository.createGrant(mutation.plan);
        break;
      case "trust.consume":
        result = await repository.consumeTrustSessionOperation(mutation.plan);
        break;
      case "trust.revoke":
        result = await repository.revokeTrustSession(mutation.plan);
        break;
      case "grant.revoke":
        result = await repository.revokeGrant(mutation.plan);
        break;
      case "client.revoke":
        result = await repository.revokeClient(mutation.plan);
        break;
      default:
        throw new Error("AGENT_AUTHORIZATION_MUTATION_UNSUPPORTED");
    }

    if (!resultValid(result, expectedAffectedRows(mutation))) {
      throw new Error("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
    }
    return result;
  };
}
