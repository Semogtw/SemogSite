import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import {
  isAgentCapability,
  resourceKindsForCapability,
} from "./capabilities";
import {
  selectorMatchesResource,
  validateResourceSelectorForKind,
} from "./resource-selectors";
import type {
  AgentCapability,
  AgentRiskCeiling,
  AgentTrustSession,
  CommandResource,
  EffectiveAgentAuthorization,
  EffectiveAgentAuthorizationClause,
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

export type TrustCoveredCommandRisk =
  | "low"
  | "medium"
  | "high"
  | "critical";

const riskRank: Readonly<Record<AgentRiskCeiling, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function trustRiskValid(value: string): value is TrustRiskCeiling {
  return value === "low" || value === "medium";
}

function agentRiskValid(value: unknown): value is AgentRiskCeiling {
  return value === "low" || value === "medium" || value === "high";
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

function clausesForCapability(input: {
  authorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
}): readonly EffectiveAgentAuthorizationClause[] {
  if (!Array.isArray(input.authorization.authorizationClauses)) return [];
  return input.authorization.authorizationClauses.filter(
    (clause) =>
      typeof clause === "object" &&
      clause !== null &&
      bounded(clause.grantId, 200) &&
      clause.capability === input.capability &&
      agentRiskValid(clause.riskCeiling) &&
      typeof clause.resourceSelectors === "object" &&
      clause.resourceSelectors !== null,
  );
}

function clauseSupportsSelector(input: {
  clause: EffectiveAgentAuthorizationClause;
  resourceKind: string;
  selector: ResourceSelector;
  requestedRisk: TrustRiskCeiling;
}): boolean {
  if (riskRank[input.clause.riskCeiling] < riskRank[input.requestedRisk]) {
    return false;
  }
  const base = input.clause.resourceSelectors[input.resourceKind];
  return Array.isArray(base) && selectorCoveredByBase(input.selector, base);
}

function capabilityHasRisk(input: {
  authorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
  requestedRisk: TrustRiskCeiling;
}): boolean {
  return clausesForCapability(input).some(
    (clause) =>
      riskRank[clause.riskCeiling] >= riskRank[input.requestedRisk],
  );
}

function requestedResourcesFitCapability(input: {
  capability: AgentCapability;
  requestedResources: ResourceSelectorMap;
  requestedRisk: TrustRiskCeiling;
  baseAuthorization: EffectiveAgentAuthorization;
}): boolean {
  const clauses = clausesForCapability({
    authorization: input.baseAuthorization,
    capability: input.capability,
  });
  if (clauses.length === 0) return false;

  for (const resourceKind of resourceKindsForCapability(input.capability)) {
    const requested = input.requestedResources[resourceKind];
    if (!Array.isArray(requested) || requested.length === 0) return false;

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
      if (
        !clauses.some((clause) =>
          clauseSupportsSelector({
            clause,
            resourceKind,
            selector,
            requestedRisk: input.requestedRisk,
          }),
        )
      ) {
        return false;
      }
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
    !Array.isArray(input.requestedCapabilities) ||
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
      !Array.isArray(input.baseAuthorization.capabilities) ||
      !input.baseAuthorization.capabilities.includes(capability)
    ) {
      throw new Error("TRUST_CAPABILITY_NOT_GRANTED");
    }

    if (
      !capabilityHasRisk({
        authorization: input.baseAuthorization,
        capability,
        requestedRisk: input.riskCeiling,
      })
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
        requestedRisk: input.riskCeiling,
        baseAuthorization: input.baseAuthorization,
      })
    ) {
      throw new Error("TRUST_RESOURCE_NOT_GRANTED");
    }
  }

  if (
    typeof input.requestedResources !== "object" ||
    input.requestedResources === null ||
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
    !Array.isArray(session.baseGrantIds) ||
    session.baseGrantIds.length < 1 ||
    session.baseGrantIds.some((grantId) => !bounded(grantId, 200)) ||
    new Set(session.baseGrantIds).size !== session.baseGrantIds.length ||
    !Array.isArray(session.capabilities) ||
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
    !Array.isArray(input.baseAuthorization.grantIds) ||
    input.baseAuthorization.grantIds.some((grantId) => !bounded(grantId, 200)) ||
    !input.session.baseGrantIds.every((grantId) =>
      input.baseAuthorization.grantIds.includes(grantId),
    ) ||
    !Array.isArray(input.baseAuthorization.authorizationClauses)
  ) {
    return false;
  }

  const allowedGrantIds = new Set(input.session.baseGrantIds);
  const authorizationClauses = input.baseAuthorization.authorizationClauses.filter(
    (clause) =>
      typeof clause === "object" &&
      clause !== null &&
      bounded(clause.grantId, 200) &&
      allowedGrantIds.has(clause.grantId) &&
      input.baseAuthorization.grantIds.includes(clause.grantId),
  );
  if (authorizationClauses.length === 0) return false;

  const narrowedAuthorization: EffectiveAgentAuthorization = {
    ...input.baseAuthorization,
    authorizationClauses,
    grantIds: [...input.session.baseGrantIds],
    trustSessionIds: [],
  };
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
      baseAuthorization: narrowedAuthorization,
    });
    return true;
  } catch {
    return false;
  }
}

export function trustSessionCoversCommand(input: {
  session: AgentTrustSession;
  baseAuthorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
  resource: CommandResource;
  risk: TrustCoveredCommandRisk;
  now: string;
}): boolean {
  if (
    !trustSessionFitsAuthorization({
      session: input.session,
      baseAuthorization: input.baseAuthorization,
      now: input.now,
    }) ||
    !input.session.capabilities.includes(input.capability) ||
    (input.risk !== "low" && input.risk !== "medium") ||
    riskRank[input.session.riskCeiling] < riskRank[input.risk] ||
    !resourceKindsForCapability(input.capability).includes(input.resource.kind)
  ) {
    return false;
  }

  const selectors = input.session.resourceSelectors[input.resource.kind];
  if (!Array.isArray(selectors) || selectors.length === 0) return false;
  try {
    return selectors.some((selector) =>
      selectorMatchesResource({ selector, resource: input.resource }),
    );
  } catch {
    return false;
  }
}
