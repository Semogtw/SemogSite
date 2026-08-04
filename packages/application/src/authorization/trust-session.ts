import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import {
  isAgentCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { validateResourceSelectorForKind } from "./resource-selectors";
import type {
  AgentCapability,
  AgentRiskCeiling,
  AgentTrustSession,
  EffectiveAgentAuthorization,
  ResourceSelector,
  ResourceSelectorMap,
  TrustRiskCeiling,
} from "./types";

export const minimumTrustDurationMinutes = 5;
export const defaultTrustDurationMinutes = 120;
export const maximumTrustDurationMinutes = 480;
export const defaultTrustMaximumOperations = 25;
export const maximumTrustOperations = 100;

export type TrustSessionState =
  | "active"
  | "not_started"
  | "expired"
  | "exhausted"
  | "revoked"
  | "invalid";

const riskRank: Readonly<Record<AgentRiskCeiling, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

function bounded(value: string, maximum: number): boolean {
  return (
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function trustRiskValid(value: string): value is TrustRiskCeiling {
  return value === "low" || value === "medium";
}

function selectorCoveredByBase(
  requested: ResourceSelector,
  base: readonly ResourceSelector[],
): boolean {
  if (base.some((selector) => selector.kind === "all")) return true;

  switch (requested.kind) {
    case "all":
      return false;
    case "exact_ids": {
      const allowed = new Set(
        base.flatMap((selector) =>
          selector.kind === "exact_ids" ? selector.ids : [],
        ),
      );
      return requested.ids.every((id) => allowed.has(id));
    }
    case "canonical_prefixes": {
      const allowed = base.flatMap((selector) =>
        selector.kind === "canonical_prefixes" ? selector.prefixes : [],
      );
      return requested.prefixes.every((prefix) =>
        allowed.some(
          (basePrefix) =>
            prefix === basePrefix || prefix.startsWith(`${basePrefix}/`),
        ),
      );
    }
    case "lifecycle_states": {
      const allowed = new Set(
        base.flatMap((selector) =>
          selector.kind === "lifecycle_states" ? selector.states : [],
        ),
      );
      return requested.states.every((state) => allowed.has(state));
    }
  }
}

function requestedResourcesFitCapability(input: {
  capability: AgentCapability;
  requestedResources: ResourceSelectorMap;
  baseAuthorization: EffectiveAgentAuthorization;
}): boolean {
  const baseByKind =
    input.baseAuthorization.capabilityResourceSelectors[input.capability];
  if (baseByKind === undefined) return false;

  for (const resourceKind of resourceKindsForCapability(input.capability)) {
    const requested = input.requestedResources[resourceKind];
    const base = baseByKind[resourceKind];
    if (
      requested === undefined ||
      requested.length === 0 ||
      base === undefined ||
      base.length === 0
    ) {
      return false;
    }

    for (const selector of requested) {
      try {
        validateResourceSelectorForKind({
          resourceKind,
          selector,
          explicitOwnerSelection: selector.kind === "all",
        });
      } catch {
        return false;
      }
      if (!selectorCoveredByBase(selector, base)) return false;
    }
  }

  return true;
}

export function validateTrustSessionRequest(input: {
  durationMinutes: number;
  maxOperations: number;
  riskCeiling: TrustRiskCeiling;
  requestedCapabilities: readonly AgentCapability[];
  requestedResources: ResourceSelectorMap;
  baseAuthorization: EffectiveAgentAuthorization;
  delegatedFromTrustSessionId?: string | null;
}): void {
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < minimumTrustDurationMinutes ||
    input.durationMinutes > maximumTrustDurationMinutes
  ) {
    throw new Error("TRUST_DURATION_INVALID");
  }

  if (
    !Number.isInteger(input.maxOperations) ||
    input.maxOperations < 1 ||
    input.maxOperations > maximumTrustOperations
  ) {
    throw new Error("TRUST_OPERATION_LIMIT_INVALID");
  }

  if (!trustRiskValid(input.riskCeiling)) {
    throw new Error("TRUST_RISK_INVALID");
  }

  if (
    input.delegatedFromTrustSessionId !== undefined &&
    input.delegatedFromTrustSessionId !== null
  ) {
    throw new Error("TRUST_DELEGATION_FORBIDDEN");
  }

  if (
    input.requestedCapabilities.length < 1 ||
    new Set(input.requestedCapabilities).size !==
      input.requestedCapabilities.length
  ) {
    throw new Error("TRUST_CAPABILITY_INVALID");
  }

  const requestedKinds = new Set<string>();
  for (const capability of input.requestedCapabilities) {
    if (
      !isAgentCapability(capability) ||
      !input.baseAuthorization.capabilities.includes(capability)
    ) {
      throw new Error("TRUST_CAPABILITY_NOT_GRANTED");
    }

    const baseRisk =
      input.baseAuthorization.riskCeilingByCapability[capability];
    if (
      baseRisk === undefined ||
      riskRank[input.riskCeiling] > riskRank[baseRisk]
    ) {
      throw new Error("TRUST_RISK_ESCALATION");
    }

    for (const resourceKind of resourceKindsForCapability(capability)) {
      requestedKinds.add(resourceKind);
    }
    if (
      !requestedResourcesFitCapability({
        capability,
        requestedResources: input.requestedResources,
        baseAuthorization: input.baseAuthorization,
      })
    ) {
      throw new Error("TRUST_RESOURCE_NOT_GRANTED");
    }
  }

  if (
    !Object.keys(input.requestedResources).every((resourceKind) =>
      requestedKinds.has(resourceKind),
    )
  ) {
    throw new Error("TRUST_RESOURCE_NOT_GRANTED");
  }
}

export function evaluateTrustSessionState(
  session: AgentTrustSession,
  now: string,
): TrustSessionState {
  if (
    !isCanonicalUtcTimestamp(now) ||
    !bounded(session.id, 200) ||
    !bounded(session.ownerId, 200) ||
    !bounded(session.clientId, 200) ||
    !isCanonicalUtcTimestamp(session.startsAt) ||
    !isCanonicalUtcTimestamp(session.expiresAt) ||
    session.startsAt >= session.expiresAt ||
    (session.revokedAt !== null &&
      (!isCanonicalUtcTimestamp(session.revokedAt) ||
        session.revokedAt < session.startsAt ||
        session.revokedAt > now)) ||
    !trustRiskValid(session.riskCeiling) ||
    !Number.isInteger(session.maxOperations) ||
    session.maxOperations < 1 ||
    session.maxOperations > maximumTrustOperations ||
    !Number.isInteger(session.operationsUsed) ||
    session.operationsUsed < 0 ||
    session.operationsUsed > session.maxOperations ||
    !Number.isInteger(session.version) ||
    session.version < 1 ||
    !bounded(session.reason, 500) ||
    session.baseGrantIds.length < 1 ||
    new Set(session.baseGrantIds).size !== session.baseGrantIds.length ||
    session.capabilities.length < 1 ||
    new Set(session.capabilities).size !== session.capabilities.length ||
    session.capabilities.some((capability) => !isAgentCapability(capability))
  ) {
    return "invalid";
  }

  if (session.revokedAt !== null) return "revoked";
  if (session.startsAt > now) return "not_started";
  if (session.expiresAt <= now) return "expired";
  if (session.operationsUsed === session.maxOperations) return "exhausted";
  return "active";
}

export function trustSessionFitsAuthorization(input: {
  session: AgentTrustSession;
  baseAuthorization: EffectiveAgentAuthorization;
  now: string;
}): boolean {
  if (
    evaluateTrustSessionState(input.session, input.now) !== "active" ||
    input.session.ownerId !== input.baseAuthorization.ownerId ||
    input.session.clientId !== input.baseAuthorization.clientId ||
    !input.session.baseGrantIds.every((grantId) =>
      input.baseAuthorization.grantIds.includes(grantId),
    )
  ) {
    return false;
  }

  const durationMinutes =
    (Date.parse(input.session.expiresAt) -
      Date.parse(input.session.startsAt)) /
    60_000;

  try {
    validateTrustSessionRequest({
      durationMinutes,
      maxOperations: input.session.maxOperations,
      riskCeiling: input.session.riskCeiling,
      requestedCapabilities: input.session.capabilities,
      requestedResources: input.session.resourceSelectors,
      baseAuthorization: input.baseAuthorization,
    });
    return true;
  } catch {
    return false;
  }
}
