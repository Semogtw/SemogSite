import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { trustSessionCoversCommand } from "./trust-session";
import type {
  AgentCapability,
  AgentTrustSession,
  CommandResource,
  EffectiveAgentAuthorization,
} from "./types";

export type TrustSessionOperationConsumptionPlan = {
  trustSessionId: string;
  ownerId: string;
  clientId: string;
  expectedVersion: number;
  nextVersion: number;
  expectedOperationsUsed: number;
  nextOperationsUsed: number;
  consumedAt: string;
};

export function planTrustSessionOperationConsumption(input: {
  session: AgentTrustSession;
  baseAuthorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
  resource: CommandResource;
  risk: "low" | "medium" | "high" | "critical";
  now: string;
}): TrustSessionOperationConsumptionPlan | null {
  if (
    !isCanonicalUtcTimestamp(input.now) ||
    !trustSessionCoversCommand(input) ||
    !Number.isInteger(input.session.version) ||
    input.session.version < 1 ||
    !Number.isInteger(input.session.operationsUsed) ||
    !Number.isInteger(input.session.maxOperations) ||
    input.session.operationsUsed < 0 ||
    input.session.operationsUsed >= input.session.maxOperations ||
    input.session.version >= Number.MAX_SAFE_INTEGER ||
    input.session.operationsUsed >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }

  return {
    trustSessionId: input.session.id,
    ownerId: input.session.ownerId,
    clientId: input.session.clientId,
    expectedVersion: input.session.version,
    nextVersion: input.session.version + 1,
    expectedOperationsUsed: input.session.operationsUsed,
    nextOperationsUsed: input.session.operationsUsed + 1,
    consumedAt: input.now,
  };
}
