import type { CommandActor } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { cloneResourceSelectorMap } from "./resource-selector-copy";
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

function boundedUniqueIds(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 10_000 &&
    value.every((item) => bounded(item, 200)) &&
    new Set(value).size === value.length
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
    !bounded(input.baseAuthorization.ownerId, 200) ||
    !bounded(input.baseAuthorization.clientId, 200) ||
    !boundedUniqueIds(input.baseAuthorization.grantIds) ||
    !isCanonicalUtcTimestamp(input.now) ||
    !bounded(input.reason, 500)
  ) {
    throw new Error("TRUST_SESSION_REQUEST_INVALID");
  }
  if (input.actor.actorId !== input.baseAuthorization.ownerId) {
    throw new Error("TRUST_SESSION_OWNER_MISMATCH");
  }

  validateTrustSessionRequest({
    durationMinutes: input.durationMinutes,
    maxOperations: input.maxOperations,
    riskCeiling: input.riskCeiling,
    requestedCapabilities: input.requestedCapabilities,
    requestedResources: input.requestedResources,
    baseAuthorization: input.baseAuthorization,
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
    ownerId: input.baseAuthorization.ownerId,
    clientId: input.baseAuthorization.clientId,
    baseGrantIds: [...input.baseAuthorization.grantIds].sort((left, right) =>
      left.localeCompare(right, "en"),
    ),
    capabilities: [...input.requestedCapabilities],
    resourceSelectors: cloneResourceSelectorMap(input.requestedResources),
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
