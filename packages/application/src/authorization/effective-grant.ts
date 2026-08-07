import { canonicalJson } from "../canonical-json";
import type { JsonValue } from "../core";
import { isCanonicalUtcTimestamp } from "../iso-timestamp";
import { sanitizeAgentGrantDefinitionBoundary } from "./agent-grant-boundary";
import { sanitizeAgentTrustSessionBoundary } from "./agent-trust-session-boundary";
import {
  oauthScopeForCapability,
  resourceKindsForCapability,
} from "./capabilities";
import { readOwnDataArray } from "./data-array";
import { trustSessionFitsAuthorization } from "./trust-session";
import type {
  AgentCapability,
  AgentGrantDefinition,
  AgentRiskCeiling,
  AgentTrustSession,
  EffectiveAgentAuthorization,
  EffectiveAgentAuthorizationClause,
  OAuthScope,
  ResourceSelector,
  ResourceSelectorMap,
} from "./types";

const riskRank: Readonly<Record<AgentRiskCeiling, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

const knownOAuthScopes = new Set<OAuthScope>([
  "devos.read",
  "devos.write.attention",
  "devos.write.projects",
  "devos.write.roadmap",
  "devos.write.workflow",
  "devos.write.growth",
  "devos.write.editorial",
  "devos.write.appearance",
  "devos.admin.request",
  "devos.development.request",
]);

function bounded(value: string, maximum: number): boolean {
  return (
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function laterRisk(
  left: AgentRiskCeiling,
  right: AgentRiskCeiling,
): AgentRiskCeiling {
  return riskRank[left] >= riskRank[right] ? left : right;
}

function selectorKey(selector: ResourceSelector): string {
  return canonicalJson(selector);
}

function cloneSelector(selector: ResourceSelector): ResourceSelector {
  return JSON.parse(selectorKey(selector)) as ResourceSelector;
}

function grantActive(input: {
  grant: AgentGrantDefinition;
  ownerId: string;
  clientId: string;
  now: string;
}): boolean {
  const { grant } = input;
  return (
    grant.ownerId === input.ownerId &&
    grant.clientId === input.clientId &&
    grant.status === "active" &&
    (grant.expiresAt === null || grant.expiresAt > input.now)
  );
}

function uniqueRecordsById<Value extends { id: string }>(
  values: readonly Value[],
): readonly Value[] {
  const records = new Map<
    string,
    { value: Value; canonical: string; conflict: boolean }
  >();
  for (const value of values) {
    let canonical: string;
    try {
      canonical = canonicalJson(value as unknown as JsonValue);
    } catch {
      continue;
    }
    const previous = records.get(value.id);
    if (previous === undefined) {
      records.set(value.id, { value, canonical, conflict: false });
    } else if (previous.canonical !== canonical) {
      previous.conflict = true;
    }
  }
  return [...records.values()]
    .filter((record) => !record.conflict)
    .map((record) => record.value)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function addSelectors(
  target: Map<string, Map<string, ResourceSelector>>,
  source: ResourceSelectorMap,
  allowedKinds: readonly string[],
): void {
  for (const resourceKind of allowedKinds) {
    const selectors = source[resourceKind];
    if (!Array.isArray(selectors)) continue;
    const bucket =
      target.get(resourceKind) ?? new Map<string, ResourceSelector>();
    for (const selector of selectors) {
      bucket.set(selectorKey(selector), cloneSelector(selector));
    }
    target.set(resourceKind, bucket);
  }
}

function selectorBucketsToMap(
  buckets: ReadonlyMap<string, ReadonlyMap<string, ResourceSelector>>,
): ResourceSelectorMap {
  const result: Record<string, readonly ResourceSelector[]> = {};
  for (const resourceKind of [...buckets.keys()].sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    const values = buckets.get(resourceKind);
    if (values === undefined) continue;
    result[resourceKind] = [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([, selector]) => selector);
  }
  return result;
}

function selectorMapForCapability(
  grant: AgentGrantDefinition,
  capability: AgentCapability,
): ResourceSelectorMap | null {
  const buckets = new Map<string, Map<string, ResourceSelector>>();
  const resourceKinds = resourceKindsForCapability(capability);
  addSelectors(buckets, grant.resourceSelectors, resourceKinds);
  const selectorMap = selectorBucketsToMap(buckets);
  return Object.keys(selectorMap).length === 0 ? null : selectorMap;
}

function clauseOrder(
  left: EffectiveAgentAuthorizationClause,
  right: EffectiveAgentAuthorizationClause,
): number {
  const byGrant = left.grantId.localeCompare(right.grantId, "en");
  return byGrant === 0
    ? left.capability.localeCompare(right.capability, "en")
    : byGrant;
}

export function computeEffectiveAgentAuthorization(input: {
  ownerId: string;
  clientId: string;
  oauthScopes: readonly OAuthScope[];
  grants: readonly AgentGrantDefinition[];
  trustSessions: readonly AgentTrustSession[];
  now: string;
}): EffectiveAgentAuthorization | null {
  if (
    !bounded(input.ownerId, 200) ||
    !bounded(input.clientId, 200) ||
    !isCanonicalUtcTimestamp(input.now)
  ) {
    return null;
  }

  const oauthScopes = readOwnDataArray(input.oauthScopes, {
    maximumItems: knownOAuthScopes.size,
  });
  const rawGrants = readOwnDataArray(input.grants, {
    maximumItems: 10_000,
  });
  if (oauthScopes === null || rawGrants === null) return null;

  const scopes = new Set<OAuthScope>();
  for (const scope of oauthScopes) {
    if (typeof scope === "string" && knownOAuthScopes.has(scope as OAuthScope)) {
      scopes.add(scope as OAuthScope);
    }
  }

  const sanitizedGrants: AgentGrantDefinition[] = [];
  for (const candidate of rawGrants) {
    const grant = sanitizeAgentGrantDefinitionBoundary(
      candidate as AgentGrantDefinition,
    );
    if (grant !== null) sanitizedGrants.push(grant);
  }
  const grants = uniqueRecordsById(sanitizedGrants).filter((grant) =>
    grantActive({ ...input, grant }),
  );

  const authorizationClauses: EffectiveAgentAuthorizationClause[] = [];
  for (const grant of grants) {
    for (const capability of [...new Set(grant.capabilities)].sort()) {
      if (!scopes.has(oauthScopeForCapability(capability))) continue;
      const resourceSelectors = selectorMapForCapability(grant, capability);
      if (resourceSelectors === null) continue;
      authorizationClauses.push({
        grantId: grant.id,
        capability,
        resourceSelectors,
        riskCeiling: grant.riskCeiling,
      });
    }
  }
  authorizationClauses.sort(clauseOrder);
  if (authorizationClauses.length === 0) return null;

  const selectorsByCapability = new Map<
    AgentCapability,
    Map<string, Map<string, ResourceSelector>>
  >();
  const riskByCapability = new Map<AgentCapability, AgentRiskCeiling>();
  const contributingGrantIds = new Set<string>();

  for (const clause of authorizationClauses) {
    const buckets = selectorsByCapability.get(clause.capability) ?? new Map();
    addSelectors(
      buckets,
      clause.resourceSelectors,
      resourceKindsForCapability(clause.capability),
    );
    selectorsByCapability.set(clause.capability, buckets);
    const previousRisk = riskByCapability.get(clause.capability);
    riskByCapability.set(
      clause.capability,
      previousRisk === undefined
        ? clause.riskCeiling
        : laterRisk(previousRisk, clause.riskCeiling),
    );
    contributingGrantIds.add(clause.grantId);
  }

  const capabilities = [...selectorsByCapability.keys()].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const capabilityResourceSelectors: Partial<
    Record<AgentCapability, ResourceSelectorMap>
  > = {};
  const riskCeilingByCapability: Partial<
    Record<AgentCapability, AgentRiskCeiling>
  > = {};
  const globalBuckets = new Map<string, Map<string, ResourceSelector>>();
  let riskCeiling: AgentRiskCeiling = "low";

  for (const capability of capabilities) {
    const buckets = selectorsByCapability.get(capability);
    const risk = riskByCapability.get(capability);
    if (buckets === undefined || risk === undefined) continue;
    const selectorMap = selectorBucketsToMap(buckets);
    capabilityResourceSelectors[capability] = selectorMap;
    riskCeilingByCapability[capability] = risk;
    riskCeiling = laterRisk(riskCeiling, risk);
    addSelectors(globalBuckets, selectorMap, Object.keys(selectorMap));
  }

  const grantIds = [...contributingGrantIds].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const baseAuthorization: EffectiveAgentAuthorization = {
    clientId: input.clientId,
    ownerId: input.ownerId,
    capabilities,
    resourceSelectors: selectorBucketsToMap(globalBuckets),
    capabilityResourceSelectors,
    riskCeiling,
    riskCeilingByCapability,
    authorizationClauses,
    grantIds,
    trustSessionIds: [],
  };

  const rawTrustSessions = readOwnDataArray(input.trustSessions, {
    maximumItems: 10_000,
  });
  const sanitizedTrustSessions: AgentTrustSession[] = [];
  if (rawTrustSessions !== null) {
    for (const candidate of rawTrustSessions) {
      const session = sanitizeAgentTrustSessionBoundary(
        candidate as AgentTrustSession,
      );
      if (session !== null) sanitizedTrustSessions.push(session);
    }
  }

  const trustSessionIds = uniqueRecordsById(sanitizedTrustSessions)
    .filter((session) =>
      trustSessionFitsAuthorization({
        session,
        baseAuthorization,
        now: input.now,
      }),
    )
    .map((session) => session.id);

  return { ...baseAuthorization, trustSessionIds };
}
