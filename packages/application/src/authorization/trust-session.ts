import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { sanitizeAgentTrustSessionBoundary } from "./agent-trust-session-boundary";
import {
  isAgentCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { sanitizeEffectiveAgentAuthorizationBoundary } from "./effective-authorization-boundary";
import {
  selectorMatchesResource,
  validateResourceSelectorForKind,
} from "./resource-selectors";
import { sanitizeTrustSessionRequestBoundary } from "./trust-session-request-boundary";
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

function trustRiskValid(value: unknown): value is TrustRiskCeiling {
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

function clausesForCapability(input: {
  authorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
}): readonly EffectiveAgentAuthorizationClause[] {
  return input.authorization.authorizationClauses.filter(
    (clause) => clause.capability === input.capability,
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

  let requested: ReturnType<typeof sanitizeTrustSessionRequestBoundary>;
  try {
    requested = sanitizeTrustSessionRequestBoundary({
      requestedCapabilities: input.requestedCapabilities,
      requestedResources: input.requestedResources,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "TRUST_CAPABILITY_INVALID"
    ) {
      throw error;
    }
    throw new Error("TRUST_RESOURCE_NOT_GRANTED");
  }

  let baseAuthorization: EffectiveAgentAuthorization;
  try {
    baseAuthorization = sanitizeEffectiveAgentAuthorizationBoundary(
      input.baseAuthorization,
    );
  } catch {
    throw new Error("TRUST_CAPABILITY_NOT_GRANTED");
  }

  const baseCapabilities = new Set(baseAuthorization.capabilities);
  const requestedKinds = new Set<string>();
  for (const capability of requested.requestedCapabilities) {
    if (!isAgentCapability(capability) || !baseCapabilities.has(capability)) {
      throw new Error("TRUST_CAPABILITY_NOT_GRANTED");
    }

    if (
      !capabilityHasRisk({
        authorization: baseAuthorization,
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
        requestedResources: requested.requestedResources,
        requestedRisk: input.riskCeiling,
        baseAuthorization,
      })
    ) {
      throw new Error("TRUST_RESOURCE_NOT_GRANTED");
    }
  }

  if (
    !Object.keys(requested.requestedResources).every((resourceKind) =>
      requestedKinds.has(resourceKind),
    )
  ) {
    throw new Error("TRUST_RESOURCE_NOT_GRANTED");
  }
}

function evaluateSanitizedTrustSessionState(
  session: AgentTrustSession,
  now: string,
): TrustSessionState {
  if (
    !isCanonicalUtcTimestamp(now) ||
    (session.revokedAt !== null &&
      (session.revokedAt < session.startsAt || session.revokedAt > now))
  ) {
    return "invalid";
  }
  if (session.revokedAt !== null) return "revoked";
  if (session.startsAt > now) return "not_started";
  if (session.expiresAt <= now) return "expired";
  if (session.operationsUsed === session.maxOperations) return "exhausted";
  return "active";
}

export function evaluateTrustSessionState(
  session: AgentTrustSession,
  now: string,
): TrustSessionState {
  const sanitized = sanitizeAgentTrustSessionBoundary(session);
  return sanitized === null
    ? "invalid"
    : evaluateSanitizedTrustSessionState(sanitized, now);
}

function trustSessionFitsSanitizedAuthorization(input: {
  session: AgentTrustSession;
  baseAuthorization: EffectiveAgentAuthorization;
  now: string;
}): boolean {
  if (
    evaluateSanitizedTrustSessionState(input.session, input.now) !== "active" ||
    input.session.ownerId !== input.baseAuthorization.ownerId ||
    input.session.clientId !== input.baseAuthorization.clientId
  ) {
    return false;
  }

  const baseGrantIds = new Set(input.baseAuthorization.grantIds);
  if (!input.session.baseGrantIds.every((grantId) => baseGrantIds.has(grantId))) {
    return false;
  }

  const allowedGrantIds = new Set(input.session.baseGrantIds);
  const authorizationClauses = input.baseAuthorization.authorizationClauses.filter(
    (clause) => allowedGrantIds.has(clause.grantId),
  );
  if (authorizationClauses.length === 0) return false;

  const narrowedAuthorization: EffectiveAgentAuthorization = {
    ...input.baseAuthorization,
    authorizationClauses,
    grantIds: input.session.baseGrantIds,
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

export function trustSessionFitsAuthorization(input: {
  session: AgentTrustSession;
  baseAuthorization: EffectiveAgentAuthorization;
  now: string;
}): boolean {
  const session = sanitizeAgentTrustSessionBoundary(input.session);
  if (session === null) return false;

  let baseAuthorization: EffectiveAgentAuthorization;
  try {
    baseAuthorization = sanitizeEffectiveAgentAuthorizationBoundary(
      input.baseAuthorization,
    );
  } catch {
    return false;
  }

  return trustSessionFitsSanitizedAuthorization({
    session,
    baseAuthorization,
    now: input.now,
  });
}

export function trustSessionCoversCommand(input: {
  session: AgentTrustSession;
  baseAuthorization: EffectiveAgentAuthorization;
  capability: AgentCapability;
  resource: CommandResource;
  risk: TrustCoveredCommandRisk;
  now: string;
}): boolean {
  const session = sanitizeAgentTrustSessionBoundary(input.session);
  if (session === null) return false;

  let baseAuthorization: EffectiveAgentAuthorization;
  try {
    baseAuthorization = sanitizeEffectiveAgentAuthorizationBoundary(
      input.baseAuthorization,
    );
  } catch {
    return false;
  }

  if (
    !trustSessionFitsSanitizedAuthorization({
      session,
      baseAuthorization,
      now: input.now,
    }) ||
    !new Set(session.capabilities).has(input.capability) ||
    (input.risk !== "low" && input.risk !== "medium") ||
    riskRank[session.riskCeiling] < riskRank[input.risk] ||
    !resourceKindsForCapability(input.capability).includes(input.resource.kind)
  ) {
    return false;
  }

  const selectors = session.resourceSelectors[input.resource.kind];
  if (!Array.isArray(selectors) || selectors.length === 0) return false;
  for (const selector of selectors) {
    if (selectorMatchesResource({ selector, resource: input.resource })) {
      return true;
    }
  }
  return false;
}
