import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { sanitizeEffectiveAgentAuthorizationBoundary } from "./effective-authorization-boundary";
import { sanitizeTrustSessionRequestBoundary } from "./trust-session-request-boundary";
import { validateTrustSessionRequest } from "./trust-session";
import type {
  AgentCapability,
  AgentTrustSession,
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
  TrustRiskCeiling,
} from "./types";

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

export function planAgentTrustSessionCreation(input: {
  actor: CommandActor;
  trustSessionId: string;
  baseAuthorization: EffectiveAgentAuthorization;
  durationMinutes: number;
  maxOperations: number;
  riskCeiling: TrustRiskCeiling;
  requestedCapabilities: readonly AgentCapability[];
  requestedResources: ResourceSelectorMap;
  now: string;
  reason: string;
}): AgentTrustSession {
  if (input.actor.kind !== "owner_ui") {
    throw new Error("TRUST_SESSION_OWNER_REQUIRED");
  }
  if (
    !bounded(input.trustSessionId, 200) ||
    !isCanonicalUtcTimestamp(input.now) ||
    !bounded(input.reason, 500)
  ) {
    throw new Error("TRUST_SESSION_REQUEST_INVALID");
  }

  let baseAuthorization: EffectiveAgentAuthorization;
  try {
    baseAuthorization = sanitizeEffectiveAgentAuthorizationBoundary(
      input.baseAuthorization,
    );
  } catch {
    throw new Error("TRUST_SESSION_REQUEST_INVALID");
  }
  const requested = sanitizeTrustSessionRequestBoundary({
    requestedCapabilities: input.requestedCapabilities,
    requestedResources: input.requestedResources,
  });

  if (input.actor.actorId !== baseAuthorization.ownerId) {
    throw new Error("TRUST_SESSION_OWNER_MISMATCH");
  }

  validateTrustSessionRequest({
    durationMinutes: input.durationMinutes,
    maxOperations: input.maxOperations,
    riskCeiling: input.riskCeiling,
    requestedCapabilities: requested.requestedCapabilities,
    requestedResources: requested.requestedResources,
    baseAuthorization,
  });

  let expiresAt: string;
  try {
    const expiresAtMilliseconds =
      Date.parse(input.now) + input.durationMinutes * 60_000;
    if (!Number.isSafeInteger(expiresAtMilliseconds)) {
      throw new Error("unsafe expiration");
    }
    expiresAt = new Date(expiresAtMilliseconds).toISOString();
    if (!isCanonicalUtcTimestamp(expiresAt) || expiresAt <= input.now) {
      throw new Error("invalid expiration");
    }
  } catch {
    throw new Error("TRUST_SESSION_REQUEST_INVALID");
  }

  return {
    id: input.trustSessionId,
    ownerId: baseAuthorization.ownerId,
    clientId: baseAuthorization.clientId,
    baseGrantIds: baseAuthorization.grantIds,
    capabilities: requested.requestedCapabilities,
    resourceSelectors: requested.requestedResources,
    riskCeiling: input.riskCeiling,
    startsAt: input.now,
    expiresAt,
    maxOperations: input.maxOperations,
    operationsUsed: 0,
    revokedAt: null,
    reason: input.reason,
    version: 1,
  };
}
